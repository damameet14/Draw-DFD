# Draw-DFD

Draw-DFD is a modern, interactive web-based tool aimed at simplifying the creation of Data Flow Diagrams (DFDs). Built with **React** and **React Flow**, it provides a seamless experience for designing systems at multiple levels of abstraction (Context / Level 0, Level 1, and Level 2).

## 🚀 Features

*   **Multi-Level Diagramming:** easily switch between **Level 0 (Context Diagram)**, **Level 1**, and **Level 2** views completely isolating the components for each level.
*   **Interactive Canvas:** Drag-and-drop nodes, zoom, pan, and snap-to-grid functionality powered by [React Flow](https://reactflow.dev/).
*   **Orthogonal Edges:** Custom edge routing ensures clean, right-angled connections between nodes, essential for professional-looking DFDs.
*   **Specialized Components:** Dedicated components for **Processes**, **Entities**, and **Data Stores** tailored to each DFD level.
*   **Custom UI Controls:**
    *   Toggle handles visibility for cleaner presentation.
    *   Toggle arrow interaction buttons.
    *   Show/Hide grid for alignment.
*   **State Management:** Robust state handling using [Zustand](https://github.com/pmndrs/zustand) to maintain diagram consistency.

## 🛠️ Tech Stack

*   **Framework:** React 19 + TypeScript
*   **Build Tool:** Vite
*   **Diagramming Library:** React Flow (v11)
*   **State Management:** Zustand
*   **Styling:** CSS Modules
*   **Icons:** Lucide React
*   **Testing:** Vitest

## 📂 Project Structure

`src/` is organized by business capability. Each module owns a `MODULE.md`
describing its responsibilities and a `public_interface.ts` that other modules
import from — never reach into a module's internal files.

```text
src/
├── application_shell/         # App root, level tabs, visibility preferences
├── data_flow_diagram_model/   # Shared DFD contracts (nodes, edges, diagram)
├── diagram_validation/        # DFD rule set and display filtering
├── diagram_state/             # Zustand store and derived validation
├── diagram_canvas/            # React Flow canvas and node/edge renderers
│   ├── process_node/
│   ├── entity_node/
│   ├── data_store_node/
│   └── data_flow_edge/
└── diagram_authoring/         # One authoring form per DFD level
```

Canvas renderers come in two sets, not three: `Context*` for Level 0, and
`Decomposed*` shared by Levels 1 and 2, which differ only at runtime via each
node's `level` field.

## 📦 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/damameet14/Draw-DFD.git
    cd Draw-DFD
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

4.  **Open your browser** and navigate to `http://localhost:5173` (or the port shown in your terminal).

## ✅ Running Tests

```bash
npm test
```

## 🔧 Building for Production

To build the project for production, run:

```bash
npm run build
```

The output will be generated in the `dist` directory, ready to be deployed to any static host (Vercel, Netlify, GitHub Pages, etc.).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.
