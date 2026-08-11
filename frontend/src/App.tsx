import { Navigate, Route, Routes } from "react-router-dom";
import { FeedbackPage } from "./pages/FeedbackPage";
import { LandingPage } from "./pages/LandingPage";
import { ResultsPage } from "./pages/ResultsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { TestPage } from "./pages/TestPage";
import { AdminPage } from "./pages/AdminPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/session/:sessionId" element={<TestPage />} />
      <Route path="/session/:sessionId/review" element={<ReviewPage />} />
      <Route path="/session/:sessionId/feedback" element={<FeedbackPage />} />
      <Route path="/session/:sessionId/results" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
