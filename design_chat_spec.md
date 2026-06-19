# VANDOR v3.2 - Premium Chat UI Specification

## 1. Core Aesthetic & Concept
The objective is to create a **high-end, cinematic AI chat experience** inspired by `emergent.sh`, blending the **Luxury (Archetype 5)** and **Swiss High-Contrast (Archetype 4)** principles. 
- **Vibe:** Jarvis-like, expensive, precise, and quiet.
- **Colors:** Deep Midnight/Obsidian (`#09090B`) with stark white text and subtle 1px translucent borders (`rgba(255,255,255,0.06)`). 
- **Typography:** `Outfit` for display/UI elements (technical elegance), `IBM Plex Sans` for chat body readability, `JetBrains Mono` for code and data. (Absolutely NO Inter or Roboto).

---

## 2. Layout & Structure

### A. The Canvas (Main Chat Area)
- **Background:** Solid `#09090B` (zinc-950). No full-screen gradients.
- **Max Width:** `max-w-3xl mx-auto` for readability. If the Artifact panel opens, shift the chat slightly to the left.
- **Spacing:** Generous bottom padding (`pb-40`) to ensure the last message isn't hidden behind the floating input bar.

### B. Chat Header
- **Style:** Minimal Glassmorphism. `fixed top-0 w-full z-40 bg-zinc-950/70 backdrop-blur-xl border-b border-white/5`.
- **Content:** 
  - Left: Sidebar toggle (if mobile).
  - Center: Chat Title (`text-sm font-medium text-zinc-300`) + Model Indicator Pill (`text-xs bg-zinc-900 border border-white/5 rounded-full px-2 py-0.5`).
  - Right: Settings / Share icon (`text-zinc-400 hover:text-zinc-100`).

### C. Sidebar (Left)
- **Surface:** `bg-zinc-950 border-r border-white/5`.
- **Active State:** Instead of a generic gray highlight, use a subtle 1px border around the active chat item + a glowing dot or bright text (`text-zinc-100 bg-zinc-900/50 border border-white/10`).
- **Icons:** Use Phosphor Icons (`Duotone` weight) for a technical/premium look. Differentiate Vault sessions with a subtle emerald tint on the lock icon.

---

## 3. Component Details

### A. Message Rendering (The Core)
*Avoid the "iMessage" dual-bubble look. AI is a document/assistant, the User is the driver.*

**User Message:**
- **Alignment:** Right-aligned.
- **Surface:** Subtle tactile card. `bg-zinc-900 border border-white/5 shadow-sm`.
- **Shape:** `rounded-2xl rounded-tr-sm px-5 py-3`.
- **Typography:** `text-zinc-200 text-base leading-relaxed`.

**Assistant Message (AI):**
- **Alignment:** Left-aligned, full-bleed within the `max-w-3xl` container. **NO BUBBLE.**
- **Typography:** `text-zinc-300 text-base leading-relaxed`.
- **Spacing:** Large gaps between paragraphs (`space-y-4`).
- **Streaming State:** Use a blinking cursor (`w-2 h-4 bg-zinc-100 inline-block animate-pulse`) at the end of the streaming text. Fade in new text chunks using Framer Motion (`opacity: 0` to `1`).

### B. Multimodal Input Bar (The Command Center)
This must feel like an expensive piece of hardware floating on the screen.
- **Position:** `fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50`.
- **Surface (Crystal Glass):** `bg-zinc-950/80 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl`.
- **Layout:** 
  - Top row (optional): Slash command autocomplete dropdown (anchored above).
  - Main row: 
    - Left: Attachment `+` Button (`text-zinc-400 hover:text-white transition-colors`).
    - Center: Auto-resizing `<textarea>` (`bg-transparent border-none focus:ring-0 text-zinc-100 placeholder:text-zinc-600`).
    - Right: Voice Input (Microphone icon) & Send Button.
- **Send Button:** High contrast. `bg-white text-black rounded-lg px-3 py-1.5 font-medium hover:bg-zinc-200 transition-transform active:scale-95`.

### C. Tool & Data Cards
When VANDOR searches the web, checks weather, or opens a vault file, render it as a premium card, not raw text.
- **Base Card:** `bg-zinc-900/50 border border-white/5 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden`.
- **Web Search Card:** Include a small favicon, site domain (`text-xs text-zinc-500 uppercase tracking-widest`), and a bold title.
- **Vault File Card:** Show a file type icon, file name, and metadata. Add a subtle emerald glow (`shadow-[0_0_15px_rgba(52,211,153,0.05)]`) to denote Vault security.

### D. Required Constraints (Vault & Warning)
- **Vault Mode Banner:** Keep terminal green, but elevate it. `bg-[#052E16] border border-[#34D399]/20 text-[#34D399] rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-mono tracking-tight`.
- **Share-to-AI Warning Card:** `bg-[#451A03] border border-[#FBBF24]/20 text-[#FBBF24] rounded-lg px-4 py-3 text-sm`.

### E. Artifact Panel
- **Behavior:** Slides in from the right when invoked (e.g., viewing generated code or document).
- **Surface:** `fixed right-0 top-0 h-full w-[40vw] min-w-[400px] bg-zinc-950 border-l border-white/10 shadow-2xl z-40`.
- **Code Blocks inside Artifact:** Use `JetBrains Mono`. Dark theme for syntax highlighting (e.g., Vercel's standard dark or Dracula), wrapped in a container with a Mac-like header (red/yellow/green dots or simple copy button).

### F. Empty State / Greeting
- **Typography:** Massive, elegant greeting. 
  `text-4xl md:text-5xl font-light tracking-tighter text-zinc-100 mb-2`.
- **Subtext:** `text-lg text-zinc-500 mb-8`. 
  *(Indonesian: "Halo. Ada yang bisa saya bantu hari ini?")*
- **Suggested Actions:** Pill-shaped buttons. `border border-white/10 bg-zinc-900/30 hover:bg-zinc-800 rounded-full px-4 py-2 text-sm text-zinc-300 transition-colors`.

---

## 4. Motion & State Indicators (Framer Motion)
- **Thinking / Searching:** Instead of a generic spinner, use an ASCII/Terminal-style loader or a subtle pulsing gradient line at the top of the input bar.
- **Message Entrance:** 
  ```javascript
  initial={{ opacity: 0, y: 10, scale: 0.98 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
  ```
- **List Staggering:** Stagger the entrance of suggested action pills and tool cards.

## 5. Testing Requirements
- **Crucial:** Apply `data-testid` to all functional elements. 
  - `data-testid="chat-input-textarea"`
  - `data-testid="chat-send-button"`
  - `data-testid="chat-message-user"`
  - `data-testid="chat-message-assistant"`
  - `data-testid="vault-mode-banner"`
  - `data-testid="artifact-panel-close"`