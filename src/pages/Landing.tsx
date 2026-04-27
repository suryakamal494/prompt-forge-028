import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, FileText, ListChecks, Layers, ArrowRight } from "lucide-react";

export default function Landing() {
  const { user, loading } = useAuth();

  useEffect(() => {
    document.title = "NotebookLM Workbench — AI Content Studio for Educators";
  }, []);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-brand">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="font-serif text-lg font-semibold">Workbench</span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </header>

      <section className="container py-16 md:py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wider text-primary mb-4">
            For content & curriculum teams
          </p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] mb-6">
            One studio. Every NotebookLM output.{" "}
            <span className="bg-gradient-brand bg-clip-text text-transparent">No Gmail handoffs.</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl">
            Upload source materials. Generate editable slide decks, study guides, and quizzes powered by Google
            NotebookLM — for your whole content team, with admin approval, role controls, and a shared library.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-gradient-brand shadow-elegant">
              <Link to="/auth">
                Start building <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-20">
          {[
            { Icon: Layers, title: "Slide decks", body: "Editable PPTX + PDF, generated from your sources." },
            { Icon: FileText, title: "Study guides", body: "Long-form Markdown reports your team can reuse." },
            { Icon: ListChecks, title: "Quizzes & flashcards", body: "Ready-to-use JSON and printable HTML." },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="rounded-xl bg-card p-6 shadow-card border">
              <Icon className="h-5 w-5 text-primary mb-3" />
              <h3 className="font-serif text-xl mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container py-10 text-sm text-muted-foreground border-t">
        © NotebookLM Workbench. Powered by Google NotebookLM.
      </footer>
    </div>
  );
}
