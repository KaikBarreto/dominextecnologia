import { Link } from "react-router-dom";
import { Clapperboard, ArrowLeft } from "lucide-react";

export default function Domiflix() {
  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col items-center justify-center px-6 text-center">
      <Clapperboard className="w-20 h-20 text-[#00C597] mb-6" />
      <h1 className="text-3xl md:text-4xl font-bold mb-3">Domiflix</h1>
      <p className="text-white/60 max-w-md mb-2">
        Plataforma de tutoriais Dominex em estilo streaming.
      </p>
      <p className="text-white/40 text-sm max-w-md mb-8">
        O backend está pronto (banco, storage, RLS). A interface completa (carrosséis, player Netflix, admin de conteúdo) será publicada em uma próxima rodada.
      </p>
      <Link
        to="/dashboard"
        className="flex items-center gap-2 px-6 py-2.5 rounded bg-[#00C597] hover:bg-[#00b287] text-black font-semibold transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar ao sistema
      </Link>
    </div>
  );
}
