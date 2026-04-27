import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import Pending from "./pages/Pending";
import Dashboard from "./pages/Dashboard";
import Notebooks from "./pages/Notebooks";
import NotebookDetail from "./pages/NotebookDetail";
import Jobs from "./pages/Jobs";
import LibraryPage from "./pages/LibraryPage";
import Account from "./pages/Account";
import Approvals from "./pages/admin/Approvals";
import UsersAdmin from "./pages/admin/Users";
import WorkerAdmin from "./pages/admin/Worker";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/pending" element={<Pending />} />

            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/notebooks" element={<ProtectedRoute><Notebooks /></ProtectedRoute>} />
            <Route path="/notebooks/:id" element={<ProtectedRoute><NotebookDetail /></ProtectedRoute>} />
            <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
            <Route path="/library" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />

            <Route path="/admin/approvals" element={<ProtectedRoute requireAdmin><Approvals /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute requireAdmin><UsersAdmin /></ProtectedRoute>} />
            <Route path="/admin/worker" element={<ProtectedRoute requireAdmin><WorkerAdmin /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
