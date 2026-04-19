import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Info, Pencil } from "lucide-react";
import { useDomiflixAvatar } from "@/hooks/useDomiflixAvatar";
import { useDomiflixDisplayName } from "@/hooks/useDomiflixDisplayName";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// Fallback simples: gera 12 avatares coloridos com iniciais (sem dependência de assets externos).
const PALETTE = ["#00C597", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#10b981", "#f97316", "#3b82f6", "#a855f7", "#14b8a6", "#eab308"];

function makeAvatarDataUrl(letter: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" rx="16" fill="${color}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial,sans-serif" font-size="100" font-weight="700" fill="#0b0b0b">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AVATARS = "ABCDEFGHIJKL".split("").map((l, i) => ({ url: makeAvatarDataUrl(l, PALETTE[i]), name: `Avatar ${l}` }));

function AvatarItem({ url, name, selected, onSelect }: { url: string; name: string; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} title={name}
      className={cn(
        "relative rounded-md overflow-hidden shrink-0 transition-all w-[80px] h-[80px] sm:w-[100px] sm:h-[100px]",
        selected ? "ring-[3px] ring-[#00C597] scale-105" : "ring-0 hover:ring-2 hover:ring-white/60 hover:scale-105"
      )}>
      <img src={url} alt={name} className="w-full h-full object-cover rounded-md" />
      {selected && (
        <div className="absolute inset-0 bg-black/30 flex items-end justify-end p-1">
          <div className="bg-[#00C597] rounded-full p-0.5"><Check className="w-3 h-3 text-black" strokeWidth={3} /></div>
        </div>
      )}
    </button>
  );
}

export default function DomiflixAvatarPicker() {
  const navigate = useNavigate();
  const { avatarUrl, setAvatar } = useDomiflixAvatar();
  const { displayName, setDisplayName } = useDomiflixDisplayName();
  const { user, profile } = useAuth();

  const [selected, setSelected] = useState<string | null>(avatarUrl);
  const systemFirstName = profile?.full_name?.split(" ")[0] ?? "Perfil";
  const currentName = displayName ?? profile?.full_name ?? "";
  const [nameDraft, setNameDraft] = useState<string>(currentName);
  const [editingName, setEditingName] = useState(false);

  useEffect(() => { if (avatarUrl && !selected) setSelected(avatarUrl); }, [avatarUrl]);
  useEffect(() => { if (!editingName) setNameDraft(displayName ?? profile?.full_name ?? ""); }, [displayName, profile?.full_name, editingName]);

  function handleSaveName() {
    const trimmed = nameDraft.trim();
    void setDisplayName(trimmed.length > 0 ? trimmed : null);
    setEditingName(false);
  }

  return (
    <div className="domiflix-root min-h-screen bg-[#141414] text-white">
      <div className="sticky top-0 z-20 bg-[#141414]/90 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-16 h-16 flex items-center justify-between gap-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/80 hover:text-white">
            <ArrowLeft className="w-5 h-5" /><span className="text-sm font-medium">Voltar</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60 hidden sm:block">{currentName || systemFirstName}</span>
            {selected && <img src={selected} alt="Avatar" className="w-10 h-10 rounded-md object-cover border-2 border-[#00C597]" />}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-16 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Editar Perfil</h1>
        <p className="text-white/50 text-sm mb-8">Personalize seu perfil dentro do Domiflix.</p>

        <section className="mb-10 rounded-lg border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-white/90 mb-1">Nome de exibição</h2>
          <p className="text-white/50 text-xs mb-4 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/40" />
            <span>Esta alteração é exclusiva do Domiflix e não afetará o nome usado no sistema.</span>
          </p>
          {editingName ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Como você quer ser chamado" maxLength={40} autoFocus
                className="flex-1 bg-[#1a1a1a] border border-white/15 focus:border-[#00C597] outline-none rounded px-3 py-2 text-sm text-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") { setNameDraft(displayName ?? profile?.full_name ?? ""); setEditingName(false); }
                }} />
              <div className="flex gap-2">
                <button onClick={handleSaveName} className="bg-[#00C597] hover:bg-[#00b287] text-black text-sm font-medium px-4 py-2 rounded">Salvar</button>
                <button onClick={() => { setNameDraft(displayName ?? profile?.full_name ?? ""); setEditingName(false); }}
                  className="bg-white/5 hover:bg-white/10 text-white/80 text-sm px-4 py-2 rounded">Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)}
              className="w-full flex items-center justify-between gap-3 bg-[#1a1a1a] hover:bg-[#222] border border-white/10 rounded px-3 py-2.5 text-left group">
              <span className="text-sm text-white">{currentName || systemFirstName}</span>
              <Pencil className="w-4 h-4 text-white/40 group-hover:text-white" />
            </button>
          )}
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white/90 mb-4 border-b border-white/10 pb-2">Escolha um avatar</h2>
          <div className="flex flex-wrap gap-3">
            {AVATARS.map((img) => (
              <AvatarItem key={img.name} url={img.url} name={img.name}
                selected={selected === img.url} onSelect={() => { setSelected(img.url); void setAvatar(img.url); }} />
            ))}
          </div>
          <p className="text-white/40 text-xs mt-6">Mais avatares serão adicionados em breve.</p>
        </section>
      </div>
    </div>
  );
}
