import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, MessageSquare, Mail, Mic } from 'lucide-react'
import toast from 'react-hot-toast'
import Avatar from '../ui/Avatar'
import EmailInviteForm from './EmailInviteForm'
import VoiceMessageBubble from './VoiceMessageBubble'
import VoiceRecorder from './VoiceRecorder'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitSendChat, emitSendVoiceMessage } from '../../services/socketService'

/**
 * Chat — real-time in-room chat panel with persistent text & voice messaging.
 *
 * Supports:
 * - Persistent chat history received on join / sync_state
 * - Instant text messaging
 * - Direct microphone recording, audio preview, and Cloudinary voice messaging
 * - Inline email invitation form
 */
export default function Chat() {
  const [input, setInput] = useState('')
  const [showEmailInvite, setShowEmailInvite] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [isSendingVoice, setIsSendingVoice] = useState(false)

  const messagesEndRef = useRef(null)
  const { chatMessages, currentUser, room } = useRoomContext()
  const { socket, isConnected } = useSocketContext()

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const sendMessage = () => {
    const text = input.trim()
    if (!text || !room?.roomId) return
    emitSendChat(socket, { roomId: room.roomId, text })
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Voice message upload submission
  const handleSendVoice = ({ audioBlob, duration, mimeType }) => {
    if (!audioBlob || !room?.roomId || !socket) return

    // 1.5 MB client-side size check
    const MAX_BYTES = 1.5 * 1024 * 1024
    if (audioBlob.size > MAX_BYTES) {
      toast.error('Voice message exceeds 1.5 MB limit.')
      return
    }

    setIsSendingVoice(true)

    emitSendVoiceMessage(
      socket,
      {
        roomId: room.roomId,
        audioData: audioBlob,
        duration,
        mimeType,
      },
      (res) => {
        setIsSendingVoice(false)
        if (res?.success) {
          setIsRecordingVoice(false)
        } else {
          toast.error(res?.message || 'Failed to send voice message.')
        }
      }
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#e4beba]/40">
            <MessageSquare className="w-10 h-10" />
            <p className="font-[Inter,sans-serif] text-[14px] text-center">
              No messages yet. Say hello or record a voice note!
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {chatMessages.map((msg) => {
              const isMe = msg.participantId
                ? msg.participantId === currentUser?.participantId
                : msg.socketId === currentUser?.socketId
              const msgId = msg.messageId || msg.id

              return (
                <motion.div
                  key={msgId}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <Avatar username={msg.username} size="sm" />
                  <div className={`max-w-[78%] sm:max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {!isMe && (
                      <span className="font-[Geist,sans-serif] text-[11px] text-[#e4beba] px-1">
                        {msg.username}
                      </span>
                    )}

                    {/* Message Bubble: Voice or Text */}
                    {msg.type === 'voice' ? (
                      <VoiceMessageBubble message={msg} isMe={isMe} />
                    ) : (
                      <div className={`
                        px-3 py-2 rounded-2xl font-[Inter,sans-serif] text-[14px] leading-[20px] break-words
                        ${isMe
                          ? 'bg-[#ffb3ad]/20 text-[#e5e1e4] border border-[#ffb3ad]/10 rounded-tr-sm'
                          : 'bg-[#201f22] text-[#e5e1e4] border border-[#27272A] rounded-tl-sm'
                        }
                      `}>
                        {msg.text}
                      </div>
                    )}

                    <span className="font-[Geist,sans-serif] text-[10px] text-[#e4beba]/40 px-1">
                      {new Date(msg.timestamp || msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 sm:p-4 border-t border-[#27272A] bg-[#1a191d] shrink-0">
        {/* Inline Email Invite Form */}
        <AnimatePresence>
          {showEmailInvite && (
            <EmailInviteForm
              roomId={room?.roomId}
              socket={socket}
              isConnected={isConnected}
              onClose={() => setShowEmailInvite(false)}
            />
          )}
        </AnimatePresence>

        {/* Email Invite toggle button */}
        <div className="flex items-center justify-between mb-2 px-1">
          <button
            type="button"
            onClick={() => setShowEmailInvite(!showEmailInvite)}
            className="flex items-center gap-1.5 text-[12px] font-[Geist,sans-serif] font-medium text-[#e4beba]/80 hover:text-[#ffb3ad] transition-colors group cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-[#ffb3ad] group-hover:scale-110 transition-transform" />
            <span>{showEmailInvite ? 'Hide email invite' : 'Invite by email'}</span>
          </button>
        </div>

        {/* Message composer / Voice recorder */}
        {isRecordingVoice ? (
          <VoiceRecorder
            onSendVoice={handleSendVoice}
            onCancel={() => setIsRecordingVoice(false)}
            isSending={isSendingVoice}
          />
        ) : (
          <div className="flex items-center gap-2 bg-[#0e0e10] border border-[#27272A] rounded-xl px-3 py-2 min-h-[44px] focus-within:border-[#ffb3ad]/40 transition-colors">
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              maxLength={500}
              className="flex-1 bg-transparent text-[#e5e1e4] font-[Inter,sans-serif] text-[13px] sm:text-[14px] focus:outline-none placeholder:text-[#e4beba]/40 min-w-0"
            />

            {/* Mic button to start voice message */}
            <button
              type="button"
              id="start-voice-btn"
              onClick={() => setIsRecordingVoice(true)}
              title="Record voice note"
              className="p-1.5 text-[#e4beba]/70 hover:text-[#ffb3ad] hover:bg-[#ffb3ad]/10 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send text button */}
            <button
              id="send-chat-btn"
              onClick={sendMessage}
              disabled={!input.trim()}
              className="text-[#ffb3ad] hover:text-[#e5e1e4] disabled:text-[#e4beba]/20 transition-colors disabled:cursor-not-allowed p-1.5 cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
