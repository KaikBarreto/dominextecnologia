import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Info, Pencil } from "lucide-react";
import { useDomiflixAvatar } from "@/hooks/useDomiflixAvatar";
import { useDomiflixDisplayName } from "@/hooks/useDomiflixDisplayName";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// ── Image catalogue ───────────────────────────────────────────────

const PADRAO_NAMES = [
  "angryman", "blue", "chicken", "dark blue",
  "fluffyblue", "fluffygrey", "fluffyred", "fluffyyellow",
  "green", "panda", "pink", "purple", "red", "yellow", "zombi",
];

function padrao(name: string) {
  return `/images/NETFLIX/PADRÃO/Name=${name}.jpg`;
}

function outras(n: number) {
  const padded = n < 10 ? `0${n}` : `${n}`;
  return `/images/NETFLIX/OUTRAS/Name=${padded}.jpg`;
}

interface AvatarSection {
  label: string;
  images: { url: string; name: string }[];
}

const SECTIONS: AvatarSection[] = [
  {
    label: "Os Clássicos",
    images: PADRAO_NAMES.map((n) => ({ url: padrao(n), name: n })),
  },
  {
    label: "Personagens — Parte 1",
    images: Array.from({ length: 50 }, (_, i) => ({
      url: outras(i + 1),
      name: `Personagem ${i + 1}`,
    })),
  },
  {
    label: "Personagens — Parte 2",
    images: Array.from({ length: 50 }, (_, i) => ({
      url: outras(i + 51),
      name: `Personagem ${i + 51}`,
    })),
  },
];

// ── Avatar item ──────────────────────────────────────────────────

function AvatarItem({
  url,
  name,
  selected,
  onSelect,
}: {
  url: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <button
      onClick={onSelect}
      title={name}
      className={cn(
        "relative rounded-md overflow-hidden shrink-0 transition-all duration-200",
        "w-[72px] h-[72px] sm:w-[90px] sm:h-[90px] md:w-[100px] md:h-[100px]",
        "focus:outline-none",
        selected
          ? "ring-[3px] ring-[#E50914] scale-105 shadow-[0_0_0_3px_#E50914]"
          : "ring-0 hover:ring-2 hover:ring-white/60 hover:scale-105",
      )}
    >
      {!loaded && !error && (
        <div className="absolute inset-0 bg-[#2a2a2a] animate-pulse rounded-md" />
      )}

      {error && (
        <div className="absolute inset-0 bg-[#2a2a2a] rounded-md flex items-center justify-center">
          <span className="text-white/20 text-[9px]">{name.slice(0, 2)}</span>
        </div>
      )}

      <img
        src={url}
        alt={name}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          "w-full h-full object-cover rounded-md transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />

      {selected && (
        <div className="absolute inset-0 bg-black/30 flex items-end justify-end p-1 pointer-events-none">
          <div className="bg-[#E50914] rounded-full p-0.5">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        </div>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function DomiflixAvatarPicker() {
  const navigate = useNavigate();
  const { avatarUrl, setAvatar } = useDomiflixAvatar();
  const { displayName, setDisplayName } = useDomiflixDisplayName();
  const { profile } = useAuth();

  const [selected, setSelected] = useState<string | null>(avatarUrl);
  const systemFirstName = profile?.full_name?.split(" ")[0] ?? "Perfil";
  const currentName = displayName ?? profile?.full_name ?? "";
  const [nameDraft, setNameDraft] = useState<string>(currentName);
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    if (avatarUrl && !selected) setSelected(avatarUrl);
  }, [avatarUrl]);

  useEffect(() => {
    if (!editingName) {
      setNameDraft(displayName ?? profile?.full_name ?? "");
    }
  }, [displayName, profile?.full_name, editingName]);

  const headerName = (displayName?.trim() || profile?.full_name?.split(" ")[0]) ?? "Perfil";

  function handleSelect(url: string) {
    setSelected(url);
    void setAvatar(url);
  }

  function handleSaveName() {
    const trimmed = nameDraft.trim();
    void setDisplayName(trimmed.length > 0 ? trimmed : null);
    setEditingName(false);
  }

  return (
    <div className="domiflix-root min-h-screen bg-[#141414] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#141414]/90 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-16 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
            <span className="text-sm font-medium">Voltar</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60 hidden sm:block">{headerName}</span>
            {selected && (
              <img
                src={selected}
                alt="Avatar atual"
                className="w-10 h-10 rounded-md object-cover border-2 border-[#E50914]"
              />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-16 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Editar Perfil</h1>
        <p className="text-white/50 text-sm mb-8">Personalize seu perfil dentro do Domiflix.</p>

        {/* Display name editor */}
        <section className="mb-10 rounded-lg border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-white/90 mb-1">Nome de exibição</h2>
          <p className="text-white/50 text-xs mb-4 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/40" />
            <span>Esta alteração é exclusiva do Domiflix e não afetará o nome usado no sistema.</span>
          </p>

          {editingName ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Como você quer ser chamado"
                maxLength={40}
                autoFocus
                className="flex-1 bg-[#1a1a1a] border border-white/15 focus:border-[#E50914] outline-none rounded px-3 py-2 text-sm text-white placeholder:text-white/30 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setNameDraft(displayName ?? profile?.full_name ?? "");
                    setEditingName(false);
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveName}
                  className="flex-1 sm:flex-none bg-[#E50914] hover:bg-[#f6121d] text-white text-sm font-medium px-4 py-2 rounded transition-colors"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    setNameDraft(displayName ?? profile?.full_name ?? "");
                    setEditingName(false);
                  }}
                  className="flex-1 sm:flex-none bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium px-4 py-2 rounded transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="w-full flex items-center justify-between gap-3 bg-[#1a1a1a] hover:bg-[#222] border border-white/10 hover:border-white/20 rounded px-3 py-2.5 text-left transition-all group"
            >
              <span className="text-sm text-white">{currentName || systemFirstName}</span>
              <Pencil className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
            </button>
          )}
        </section>

        {/* Avatar disclaimer */}
        <p className="text-white/50 text-xs mb-6 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/40" />
          <span>O ícone escolhido é exclusivo do Domiflix e não substituirá sua foto no sistema.</span>
        </p>

        {SECTIONS.map((section) => (
          <section key={section.label} className="mb-12">
            <h2 className="text-base sm:text-lg font-semibold text-white/90 mb-4 border-b border-white/10 pb-2">
              {section.label}
            </h2>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {section.images.map((img) => (
                <AvatarItem
                  key={img.url}
                  url={img.url}
                  name={img.name}
                  selected={selected === img.url}
                  onSelect={() => handleSelect(img.url)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
