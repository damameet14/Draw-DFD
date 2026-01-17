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
*   **Styling:** CSS Modules / PostCSS
*   **Icons:** Lucide React

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
