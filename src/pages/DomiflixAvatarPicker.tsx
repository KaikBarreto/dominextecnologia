import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Info, Pencil, User } from "lucide-react";
import { useDomiflixAvatar } from "@/hooks/useDomiflixAvatar";
import { useDomiflixDisplayName } from "@/hooks/useDomiflixDisplayName";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// ── Image catalogue ───────────────────────────────────────────────

const PADRÃO_NAMES = [
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
    images: PADRÃO_NAMES.map((n) => ({ url: padrao(n), name: n })),
  },
  {
    label: "Personagens — Parte 1",
    images: Array.from({ length: 85 }, (_, i) => ({
      url: outras(i + 1),
      name: `Personagem ${i + 1}`,
    })),
  },
  {
    label: "Personagens — Parte 2",
    images: Array.from({ length: 85 }, (_, i) => ({
      url: outras(i + 86),
      name: `Personagem ${i + 86}`,
    })),
  },
  {
    label: "Personagens — Parte 3",
    images: Array.from({ length: 85 }, (_, i) => ({
      url: outras(i + 171),
      name: `Personagem ${i + 171}`,
    })),
  },
];

// ── Avatar image with loading state ──────────────────────────────

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
      {/* Shimmer enquanto carrega — suave e sutil */}
      {!loaded && !error && (
        <div className="absolute inset-0 rounded-md bg-gradient-to-br from-white/[0.07] to-white/[0.02] animate-pulse [animation-duration:2.2s]" />
      )}

      {/* Fallback on error */}
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
          "w-full h-full object-cover rounded-md transition-opacity duration-500 ease-out",
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

// ── "Minha foto" — a foto original da conta do usuário ───────────

function MyPhotoItem({
  photoUrl,
  initials,
  selected,
  onSelect,
}: {
  photoUrl: string | null;
  initials: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const hasPhoto = !!photoUrl && !error;

  return (
    <button
      onClick={onSelect}
      title="Minha foto"
      className={cn(
        "relative rounded-md overflow-hidden shrink-0 transition-all duration-200",
        "w-[72px] h-[72px] sm:w-[90px] sm:h-[90px] md:w-[100px] md:h-[100px]",
        "focus:outline-none",
        selected
          ? "ring-[3px] ring-[#E50914] scale-105 shadow-[0_0_0_3px_#E50914]"
          : "ring-0 hover:ring-2 hover:ring-white/60 hover:scale-105",
      )}
    >
      {hasPhoto ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 bg-[#2a2a2a] animate-pulse rounded-md" />
          )}
          <img
            src={photoUrl!}
            alt="Minha foto"
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            className={cn(
              "w-full h-full object-cover rounded-md transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : (
        // Sem foto de conta → mostra as iniciais (mesmo fallback do header)
        <div className="absolute inset-0 bg-[#E50914] rounded-md flex items-center justify-center">
          <span className="text-white text-lg sm:text-xl font-semibold">{initials}</span>
        </div>
      )}

      {/* Selo "conta" diferenciando dos avatares de personagem */}
      {!selected && (
        <div className="absolute top-1 left-1 bg-black/55 rounded-full p-1 pointer-events-none">
          <User className="w-3 h-3 text-white" strokeWidth={2.5} />
        </div>
      )}

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
  const { avatarUrl, setAvatar, clearAvatar } = useDomiflixAvatar();
  const { displayName, setDisplayName } = useDomiflixDisplayName();
  const { user, profile } = useAuth();

  // `selected` = avatar Domiflix ativo (string url) ou null = "Minha foto"
  // (sem avatar Domiflix → o Domiflix faz fallback pra foto da conta).
  const [selected, setSelected] = useState<string | null>(avatarUrl);
  const systemFirstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "Perfil";
  const currentName = displayName ?? user?.user_metadata?.full_name ?? "";
  const [nameDraft, setNameDraft] = useState<string>(currentName);
  const [editingName, setEditingName] = useState(false);

  // Foto original da conta (mesma fonte do fallback do header Domiflix).
  const accountPhoto = profile?.avatar_url || null;

  // Iniciais da conta (fallback quando não há foto), espelhando o header.
  const accountInitials = (() => {
    const name = profile?.full_name?.trim() || user?.user_metadata?.full_name?.trim() || "";
    if (!name) return "?";
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  })();

  // "Minha foto" está ativa quando não há avatar Domiflix selecionado.
  const myPhotoSelected = !selected;

  // Mantém `selected` em sincronia com o avatar Domiflix do DB (que pode
  // resolver depois do mount). Null = "Minha foto" ativa.
  useEffect(() => {
    setSelected(avatarUrl);
  }, [avatarUrl]);

  // Sync nameDraft when display name resolves from DB
  useEffect(() => {
    if (!editingName) {
      setNameDraft(displayName ?? user?.user_metadata?.full_name ?? "");
    }
  }, [displayName, user?.user_metadata?.full_name, editingName]);

  const headerName = (displayName?.trim() || user?.user_metadata?.full_name?.split(" ")[0]) ?? "Perfil";

  function handleSelect(url: string) {
    setSelected(url);
    void setAvatar(url);
  }

  // "Minha foto": zera o avatar Domiflix → o Domiflix volta a exibir a foto
  // da conta (fallback do header) ou as iniciais quando não há foto.
  function handleSelectMyPhoto() {
    setSelected(null);
    void clearAvatar();
  }

  function handleSaveName() {
    const trimmed = nameDraft.trim();
    void setDisplayName(trimmed.length > 0 ? trimmed : null);
    setEditingName(false);
  }

  return (
    <div className="domiflix-app min-h-screen bg-[#141414] text-white">
      {/* ── Header ─────────────────────────────────────────────── */}
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
            {selected ? (
              <img
                src={selected}
                alt="Avatar atual"
                className="w-10 h-10 rounded-md object-cover border-2 border-[#E50914]"
              />
            ) : accountPhoto ? (
              <img
                src={accountPhoto}
                alt="Avatar atual"
                className="w-10 h-10 rounded-md object-cover border-2 border-[#E50914]"
              />
            ) : (
              <div className="w-10 h-10 rounded-md bg-[#E50914] border-2 border-[#E50914] flex items-center justify-center text-sm font-semibold text-white">
                {accountInitials}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Page content ───────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-16 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Editar Perfil</h1>
        <p className="text-white/50 text-sm mb-8">Personalize seu perfil dentro do Domiflix.</p>

        {/* ── Display name editor ───────────────────────────── */}
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
                    setNameDraft(displayName ?? user?.user_metadata?.full_name ?? "");
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
                    setNameDraft(displayName ?? user?.user_metadata?.full_name ?? "");
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

        {/* ── Avatar picker disclaimer ──────────────────────── */}
        <p className="text-white/50 text-xs mb-6 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/40" />
          <span>O ícone escolhido é exclusivo do Domiflix e não substituirá sua foto no sistema.</span>
        </p>

        {/* ── "Minha foto" — volta pra foto original da conta ─────── */}
        <section className="mb-12">
          <h2 className="text-base sm:text-lg font-semibold text-white/90 mb-4 border-b border-white/10 pb-2">
            Minha conta
          </h2>
          <div className="flex flex-wrap items-start gap-3 sm:gap-4">
            <div className="flex flex-col items-center gap-2">
              <MyPhotoItem
                photoUrl={accountPhoto}
                initials={accountInitials}
                selected={myPhotoSelected}
                onSelect={handleSelectMyPhoto}
              />
              <span className="text-[11px] text-white/60 text-center max-w-[100px]">
                Minha foto
              </span>
            </div>
            <p className="flex-1 min-w-[180px] text-white/45 text-xs leading-relaxed pt-1">
              Use a mesma foto da sua conta no Domiflix. Ao selecionar, removemos o
              ícone exclusivo e voltamos a exibir a foto do seu perfil no sistema
              {accountPhoto ? "" : " (ou suas iniciais, caso não tenha foto)"}.
            </p>
          </div>
        </section>

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
