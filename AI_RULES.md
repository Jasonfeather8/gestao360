# Tech Stack
- **Framework**: React 19 (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4 with CSS Variables for theming
- **State Management**: Zustand (Global UI and session state)
- **Routing**: React Router DOM 7
- **Icons**: Lucide React
- **Animations**: Motion (framer-motion)
- **Data Fetching**: TanStack React Query (managed via `src/hooks/useData.ts`)
- **Backend Layer**: Node.js / Express (Server-side operations)
- **AI Integration**: Google Generative AI (@google/genai)

# Project Rules
- **Component Placement**: 
  - Main views/pages go in `src/pages/`.
  - Reusable UI elements go in `src/components/`.
  - Complex UI components (Dialogs, Popovers) should favor `shadcn/ui` conventions, though current components are custom Tailwind-built for specific "Clara" aesthetics.
- **Routing**: Keep all route definitions in `src/App.tsx`.
- **Styling Conventions**:
  - Always use Tailwind CSS classes.
  - Utilize the design tokens defined in `src/index.css` (e.g., `text-primary`, `bg-surface`, `border-surface-border`).
  - Support both Light and "Soft Warm Light" (Clara Dark) modes using the `.dark` class.
- **Data Management**:
  - Use `src/hooks/useData.ts` as the central point for data access.
  - Mock data is located in `src/mocks/` for development.
  - Business logic/Services are located in `src/services/`.
- **Icons**: Exclusively use `lucide-react`. Ensure icons are sized consistently (usually `w-4 h-4` or `w-5 h-5`).
- **Development Workflow**:
  - The main entry point is `src/App.tsx`.
  - Routes are defined in `src/App.tsx`, with the default landing page being `src/pages/Dashboard.tsx`.
