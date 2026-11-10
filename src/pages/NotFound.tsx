import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { DarkVeilPage } from "@/components/ui/DarkVeilPage";
import { useAuth } from "@/contexts/AuthContext";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdminUser } = useAuth();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <DarkVeilPage contentClassName="space-y-6 px-1 sm:px-6">
      <h1
        className="text-[140px] md:text-[200px] font-black leading-none tracking-tighter text-white select-none"
        style={{ fontFamily: "'Lufga', sans-serif", fontWeight: 900 }}
      >
        404
      </h1>
      <div className="-mt-10 md:-mt-14 space-y-3">
        <h2 className="text-2xl md:text-3xl font-bold text-white">
          Página não Encontrada
        </h2>
        <p className="text-white/60 text-sm max-w-md mx-auto">
          A página que você está procurando não existe ou foi movida.
        </p>
      </div>
      <Button
        onClick={() => navigate(isAdminUser ? "/admin/empresas" : "/dashboard")}
        size="lg"
        className="mt-4 gap-2"
      >
        <Home className="h-4 w-4" />
        Voltar ao Início
      </Button>
    </DarkVeilPage>
  );
};

export default NotFound;
