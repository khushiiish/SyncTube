---
name: Synchronous Dark Media System
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#e4beba'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#ab8986'
  outline-variant: '#5b403e'
  surface-tint: '#ffb3ad'
  primary: '#ffb3ad'
  on-primary: '#68000a'
  primary-container: '#ff5451'
  on-primary-container: '#5c0008'
  inverse-primary: '#b91a24'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#adc6ff'
  on-tertiary: '#002e6a'
  tertiary-container: '#4d8eff'
  on-tertiary-container: '#00285d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad7'
  primary-fixed-dim: '#ffb3ad'
  on-primary-fixed: '#410004'
  on-primary-fixed-variant: '#930013'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  display-hero:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-xs:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 64px
  gutter: 20px
  container-max: 1440px
---

## Brand & Style

The design system is engineered for **SyncTube**, a high-performance real-time watch party platform. The brand personality is "Precision Entertainment"—merging the technical rigor of developer tools with the immersive, fluid energy of modern streaming services. 

The aesthetic is a hybrid of **Minimalism** and **Glassmorphism**, drawing inspiration from the focused productivity of Linear and the atmospheric depth of Spotify. The goal is to create a "theatrical" interface where the UI recedes to prioritize content, appearing only as high-fidelity glass layers when interaction is required. The emotional response should be one of sophisticated control, low friction, and premium immersion.

## Colors

The palette is anchored in a deep, nocturnal base to minimize eye strain and maximize the vibrance of video content.

- **Primary (Power Red):** Used for critical actions, live indicators, and brand highlights.
- **Secondary (Vivid Violet):** Used for social features, participant highlights, and creative actions.
- **Accent (Electric Blue):** Reserved for links, active states, and technical notifications.
- **Neutral/Background:** An ultra-dark zinc-black (#09090B) serves as the canvas.
- **Surfaces:** Cards and panels use a slightly lighter slate-tinted navy (#111827) with high transparency to allow background glow effects to permeate.
- **Gradients:** Use a linear transition from Primary to Secondary to Accent (Red → Purple → Blue) for "Live" status glows, progress bars, and premium user avatars.

## Typography

This design system utilizes a dual-font approach to balance technical precision with readability. 

**Geist** is the primary choice for headings and UI labels, providing a monospaced-adjacent feel that evokes developer tools like Vercel or Linear. It is tight, geometric, and modern. **Inter** is used for body copy and chat messages to ensure maximum legibility during long-form reading and rapid social interaction.

For large Hero titles, use tight letter-spacing and heavy weights to create a "wall of text" impact that feels editorial and bold.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model with strict 4px increments.

- **Desktop:** A 12-column system optimized for side-by-side viewing (Video on left/center, Chat on right). The chat sidebar is typically a fixed 320px–400px width, while the video container remains fluid.
- **Mobile:** A single-column stack. The video player is pinned to the top (sticky) while the chat and discovery feed scroll underneath.
- **Margins:** Use 24px (lg) margins on desktop to allow the interface room to breathe, and 16px (md) on mobile.
- **Safe Areas:** Ensure all interactive elements have a minimum 44px hit target, especially for playback controls.

## Elevation & Depth

Depth is conveyed through **Glassmorphism** and **Tonal Layering** rather than traditional heavy shadows.

1.  **Level 0 (Base):** #09090B. Pure black/zinc background.
2.  **Level 1 (Surface):** #111827 with 60% opacity and a 12px backdrop-blur. Used for the main sidebar and footer player controls.
3.  **Level 2 (Floating):** #111827 with 80% opacity, 20px backdrop-blur, and a 1px border (#27272A). Used for modals, dropdowns, and hover-state tooltips.
4.  **Accents:** Subtle "glows" are created using low-opacity radial gradients behind cards (e.g., a 5% opacity Red glow behind a "Live" card).

**Borders:** Every card and button must have a subtle 1px border (#27272A) to define the edge against the dark background.

## Shapes

The design system uses a **Rounded** (Level 2) shape language to soften the "technical" feel and make the app feel more accessible and premium.

- **Standard Elements:** 8px (0.5rem) for input fields, small buttons, and chips.
- **Large Elements (Cards/Modals):** 16px (1rem) to 20px (1.25rem) for video thumbnails and main container cards.
- **Pill Shapes:** Used exclusively for "Live" badges, user status indicators, and primary call-to-action buttons.

## Components

### Buttons
- **Primary:** Solid Red (#EF4444) or Gradient (Red-Purple). Text is white.
- **Secondary:** Transparent with a 1px border (#27272A). On hover, background fills to #111827.
- **Ghost:** No border, Geist font, subtle highlight on hover.

### Cards
- Always semi-transparent with `backdrop-filter: blur(12px)`.
- 1px border of #27272A.
- Hover state: The border color brightens to #3F3F46 and the card lifts -2px (Framer Motion).

### Input Fields
- Background: #09090B (Darker than cards).
- Border: #27272A.
- Focus: Border changes to Primary Red or Secondary Purple with a subtle outer glow.

### Chips & Badges
- Small, uppercase Geist font.
- "Live" badges feature a pulsing red dot animation.

### Icons
- Use **Lucide** icons. Line weight: 1.5px or 2px.
- Icons should be secondary in color (Zinc-400) and turn Primary/White on hover.

### Animations
- **Transitions:** 0.2s ease-out for all hover states.
- **Entrance:** Use Framer Motion `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}` for new chat messages and list items.
- **Layout:** Smoothly animate the expansion/contraction of the sidebar.