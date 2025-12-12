# CellTracker AI 🔬

**CellTracker AI** is a sophisticated, browser-based computational biology tool that leverages Multimodal AI (Google Gemini 3 Pro) to analyze microscopy videos. It automates the detection, tracking, and phenotyping of cells, providing real-time visualization and generating formal scientific reports without the need for complex backend infrastructure.

---

## 🚀 Key Features

### 1. Zero-Backend Architecture
*   **Privacy-First:** All video processing happens locally in the browser using HTML5 Canvas and the Web Audio/Video APIs.
*   **Client-Side AI:** Communicates directly from the frontend to the Google Gemini API. No video data is ever stored on an intermediate server.

### 2. Adaptive Video Sampling
*   **Smart Extraction:** Regardless of video length (10 seconds or 5 minutes), the engine uses an **Adaptive Sampling** algorithm to extract ~30 representative frames distributed evenly across the timeline.
*   **Optimization:** This ensures the application respects API rate limits and browser memory constraints while capturing long-term biological trends.

### 3. Advanced Biological Analysis
*   **Cell Detection:** Identifies cell centroids ($x, y$) and radii ($r$) even for partial cells at frame edges.
*   **Phenotyping:** Classifies cells into specific biological states based on morphology:
    *   *Mitotic Phases:* Prophase, Metaphase, Anaphase.
    *   *Health:* Normal, Apoptotic, Blebbing, Lysing.
    *   *Morphology:* Elongated, Rounding, Spreading.
*   **Event Detection:** Automatically logs significant events like Mitosis (cell division) and Apoptosis (cell death).

### 4. Heuristic Object Tracking
*   **Motion Trails:** Links cell identifications across temporally spaced frames using a Euclidean distance heuristic.
*   **Visual History:** Renders "Comet Tails" to visualize the trajectory and motility history of individual cells.

### 5. Data Visualization
*   **Interactive Player:** Custom video player with synchronized SVG/Canvas overlays.
*   **Population Dynamics:** Real-time line charts tracking cell count over time.
*   **Scientific Reporting:** Generates a Markdown-formatted laboratory report summarizing population growth, event frequency, and biological conclusions.

---

## 🛠️ Technical Stack

*   **Core Framework:** React 19 (TypeScript).
*   **AI Model:** Google Gemini 3 Pro Preview (`gemini-3-pro-preview`) via `@google/genai`.
*   **Styling:** Tailwind CSS.
*   **Visualization:** HTML5 Canvas (Overlays), Recharts (Graphs), Lucide React (Icons).
*   **Build/Runtime:** ES Modules via ImportMap (No bundler configuration required for simple deployment).

---

## 🧬 Scientific Methodology

### 1. Frame Extraction & Pre-processing
The application loads the video into a hidden HTML5 Video element. It calculates a sampling interval ($t_{interval} = T_{total} / 30$). The video seeks to specific timestamps, draws the frame to a canvas, downscales it (max 1024px dimension) to optimize payload size, and converts it to a base64 JPEG string.

### 2. Multimodal Inference
Each frame is sent to **Gemini 3 Pro** with a specialized system prompt acting as an "Expert Computational Biologist."
*   **Input:** High-res image frame + Contextual Prompt.
*   **Output:** Structured JSON containing coordinates, radii, and status labels for every cell, plus frame-level events.

### 3. Trajectory Linking (The Tracker)
Since the AI analyzes frames independently, a post-processing algorithm links cells to create consistent IDs:
1.  For Frame $N$, compare every cell to cells in Frame $N-1$.
2.  Calculate Euclidean distance: $d = \sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}$.
3.  If $d < Threshold$ (25% of screen width), link the ID and append coordinates to the history array.
4.  If no match is found, assign a new ID (implying a new cell entered the frame or a division occurred).

---

## 📦 Installation & Usage

### Prerequisites
*   A modern web browser (Chrome/Edge/Firefox).
*   A **Google Gemini API Key** (Paid tier recommended for high-resolution vision tasks).

### Running the App
1.  Clone the repository.
2.  Serve the directory using a static file server (e.g., `npx serve`, Python `http.server`, or VS Code Live Server).
3.  Open `index.html` in your browser.

### User Guide
1.  **Enter API Key:** On launch, paste your Gemini API Key. This is stored in React state and used for the session.
2.  **Upload Video:** Drag and drop a microscopy video file.
    *   *Supported Formats:* `.mp4`, `.webm`, `.mov`, `.mkv`.
    *   *Note:* H.265/HEVC videos may not play in all browsers; convert to H.264 if necessary.
3.  **Analyze:** Click "Start Analysis".
    *   *Progress:* The bar indicates extraction, AI inference, and report generation stages.
4.  **Review Results:**
    *   **Player:** Watch the video with colored overlays (Green = Normal, Cyan = Mitosis).
    *   **Graph:** Analyze the population growth curve.
    *   **Report:** Read the AI-generated scientific conclusion at the bottom.

---

## ⚠️ Limitations & Known Issues

1.  **Browser Codec Support:** The app relies on the browser's native video decoder. Some proprietary formats (like raw `.avi` or specialized `.nd2` microscopy files) must be converted to MP4 first.
2.  **API Quotas:** Analyzing a video requires ~30 multimodal API calls. On the free tier, this may trigger Rate Limit (`429`) errors.
3.  **Tracking Accuracy:** The heuristic tracker assumes cells do not move more than 25% of the screen width between sampled frames. Extremely fast-moving cells in low-framerate videos may lose their ID tracking.

---

## 📄 License

This project is open-source. Feel free to modify the prompt engineering in `geminiService.ts` to adapt the tool for different cell types (e.g., neurons vs. bacteria).
