---
name: Ethereal Velocity
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#bec8ce'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#899298'
  outline-variant: '#3f484e'
  surface-tint: '#7bd1fa'
  primary: '#c5eaff'
  on-primary: '#003547'
  primary-container: '#7dd3fc'
  on-primary-container: '#005b78'
  inverse-primary: '#006686'
  secondary: '#89ceff'
  on-secondary: '#00344d'
  secondary-container: '#00a2e6'
  on-secondary-container: '#00344e'
  tertiary: '#ffdfba'
  on-tertiary: '#452b00'
  tertiary-container: '#febc60'
  on-tertiary-container: '#754b00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c0e8ff'
  primary-fixed-dim: '#7bd1fa'
  on-primary-fixed: '#001e2b'
  on-primary-fixed-variant: '#004d66'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#ffddb5'
  tertiary-fixed-dim: '#fcba5e'
  on-tertiary-fixed: '#2a1800'
  on-tertiary-fixed-variant: '#633f00'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 48px
  margin-mobile: 16px
  player-max-width: 480px
---

## Brand & Style
The brand personality is high-tech, immersive, and sophisticated. It targets a digitally native audience that values focus and aesthetic clarity over visual clutter. The UI should evoke a sense of "digital calm" even while displaying high-energy short-form content.

The design style is a hybrid of **Minimalism** and **Glassmorphism**. By using a "Deep Dark" canvas, we allow content to be the primary focus, while UI elements exist on a separate, translucent plane. The interface should feel like a premium piece of hardware—precise, responsive, and tactile. High-tech accents provide a sense of momentum and "active" energy.

## Colors
The palette is built on a foundation of **Near-Black/Charcoal** (#0A0A0A) to ensure the infinite scroll experience is easy on the eyes and provides maximum contrast for video content. 

The accent color is **Baby Blue** (#7DD3FC), used sparingly for high-impact actions, progress bars, and active indicators. To create depth within the dark theme, we use a secondary **Deep Sky Blue** for hover states and a **Neutral Surface** (#171717) for card backgrounds and navigation containers. Overlays should utilize 40-60% opacity of the neutral color combined with a backdrop blur to achieve the glass effect.

## Typography
We use **Inter** for its neutral, systematic clarity, which balances the expressive nature of video content. Headlines use tight letter-spacing and heavy weights to command attention without being decorative. 

For technical metadata (view counts, timestamps, durations), **JetBrains Mono** is introduced to reinforce the "high-tech" aesthetic. This monospaced font provides a functional, precise contrast to the fluid sans-serif used for names and descriptions. All body text should be rendered in high-legibility shades of off-white or silver to maintain contrast against the deep charcoal backgrounds.

## Layout & Spacing
The layout uses a **Fluid Center-Weighted Grid**. On desktop, the central video player is the anchor, constrained to a maximum width to maintain the vertical aspect ratio typical of short-form content. 

The sidebar navigation is fixed to the left with a generous 48px margin from the screen edge. Spacing follows a strict 4px/8px baseline grid to ensure mathematical harmony. Elements within cards use "Internal Breathing Room" (24px padding) to prevent the UI from feeling cramped. Between video cards, we use massive vertical gutters (40px+) to allow the glassmorphic shadows and blurs to "bleed" naturally into the background.

## Elevation & Depth
Depth is achieved through **Glassmorphism** and **Backdrop Blurs**. We avoid traditional drop shadows in favor of "Inner Glows" and "Translucent Layering."

1.  **Level 0 (Base):** The #0A0A0A background.
2.  **Level 1 (Surface):** Sidebar and header with a 20px backdrop blur and 10% white border-stroke to define edges.
3.  **Level 2 (Cards):** Video player containers with a subtle 1px "rim light" stroke at the top to simulate a physical edge.
4.  **Level 3 (Overlays):** Modals and popovers use a more opaque glass effect (70% dark gray) with a soft outer glow in baby blue to indicate focus.

## Shapes
The shape language is consistently **Rounded** (Level 2). This softens the high-tech aesthetic, making it feel approachable rather than cold. 

Main video containers use `rounded-xl` (1.5rem) to create a "viewport" feel. Smaller elements like buttons and chips utilize `rounded-lg` (1rem). Interaction elements that require high affordance, such as the "Follow" button or "Live" badges, use a full **Pill** shape to differentiate them from structural containers.

## Components
-   **Video Player Cards:** Feature a subtle 1px border stroke (rgba(255,255,255,0.1)). Controls are overlaid using glassmorphic circles.
-   **Sidebar Navigation:** Uses "Active States" indicated by a vertical baby blue bar and a soft glow behind the icon. Backgrounds are transparent until hover.
-   **Rounded Buttons:** Primary buttons are solid Baby Blue with black text for maximum punch. Secondary buttons are "Ghost" style with a glass background and blue border.
-   **Search Bar:** A wide, pill-shaped input with a dark semi-transparent fill and a subtle inner shadow. The placeholder text uses the monospaced label font.
-   **Interaction Chips:** Used for hashtags and categories. These have a dark fill and light gray text, turning baby blue only on hover.
-   **Progress Bars:** Ultra-thin (2px) baby blue lines that "glow" at the leading edge to indicate content playback.