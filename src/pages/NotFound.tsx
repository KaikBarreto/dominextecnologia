import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="text-center space-y-6 px-6">
        <h1 className="text-[120px] md:text-[180px] font-black leading-none tracking-tighter text-white/10 select-none">
          404
        </h1>
        <div className="-mt-16 md:-mt-24 relative z-10 space-y-3">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Página não Encontrada
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            A página que você está procurando não existe ou foi movida.
          </p>
        </div>
        <Button
          onClick={() => navigate("/dashboard")}
          size="lg"
          className="mt-4 gap-2"
        >
          <Home className="h-4 w-4" />
          Voltar ao Início
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
