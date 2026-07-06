import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, MessageSquare } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitSendChat } from '../../services/socketService'

/**
 * Chat — real-time in-room chat panel.
 * In-memory only (messages cleared when room closes).
 * Messages animate in from bottom (Framer Motion entrance).
 */
export default function Chat() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const { chatMessages, currentUser, room } = useRoomContext()
  const { socket } = useSocketContext()

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

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#e4beba]/40">
            <MessageSquare className="w-10 h-10" />
            <p className="font-[Inter,sans-serif] text-[14px] text-center">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {chatMessages.map((msg) => {
              const isMe = msg.socketId === currentUser?.socketId
              return (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <Avatar username={msg.username} size="sm" />
                  <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {!isMe && (
                      <span className="font-[Geist,sans-serif] text-[11px] text-[#e4beba] px-1">
                        {msg.username}
                      </span>
                    )}
                    <div className={`
                      px-3 py-2 rounded-2xl font-[Inter,sans-serif] text-[14px] leading-[20px] break-words
                      ${isMe
                        ? 'bg-[#ffb3ad]/20 text-[#e5e1e4] border border-[#ffb3ad]/10 rounded-tr-sm'
                        : 'bg-[#201f22] text-[#e5e1e4] border border-[#27272A] rounded-tl-sm'
                      }
                    `}>
                      {msg.text}
                    </div>
                    <span className="font-[Geist,sans-serif] text-[10px] text-[#e4beba]/40 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[#27272A]">
        <div className="flex gap-2 bg-[#0e0e10] border border-[#27272A] rounded-xl px-3 py-2 focus-within:border-[#ffb3ad]/40 transition-colors">
          <input
            id="chat-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            maxLength={500}
            className="flex-1 bg-transparent text-[#e5e1e4] font-[Inter,sans-serif] text-[14px] focus:outline-none placeholder:text-[#e4beba]/40"
          />
          <button
            id="send-chat-btn"
            onClick={sendMessage}
            disabled={!input.trim()}
            className="text-[#ffb3ad] hover:text-[#e5e1e4] disabled:text-[#e4beba]/20 transition-colors disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
