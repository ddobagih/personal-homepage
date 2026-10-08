import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("페이지 관리 화면을 시작할 수 없습니다.");
createRoot(root).render(<App />);
