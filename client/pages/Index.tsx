import {
  type ComponentType,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeftRight,
  Braces,
  Code2,
  Copy,
  FileText,
  Fingerprint,
  History,
  Layers,
  Moon,
  Palette as PaletteIcon,
  RefreshCw,
  Regex,
  Sparkles,
  Star,
  SunMedium,
  Trash2,
} from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ToolId =
  | "json"
  | "uuid"
  | "palette"
  | "regex"
  | "base64"
  | "markdown";

type ThemeMode = "light" | "dark";

type PaletteFavorite = {
  id: string;
  base: string;
  shades: string[];
  complementary: string[];
  savedAt: number;
};

type ToolDefinition = {
  id: ToolId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const tools: ToolDefinition[] = [
  {
    id: "json",
    label: "JSON Formatter",
    description: "Clean, validate, and copy structured data effortlessly.",
    icon: Braces,
  },
  {
    id: "uuid",
    label: "UUID Generator",
    description: "Generate secure identifiers and keep your recent history.",
    icon: Fingerprint,
  },
  {
    id: "palette",
    label: "Color Palette",
    description: "Craft radiant palettes with smart complementary shades.",
    icon: PaletteIcon,
  },
  {
    id: "regex",
    label: "Regex Tester",
    description: "Run patterns, validate flags, and preview replacements.",
    icon: Regex,
  },
  {
    id: "base64",
    label: "Base64 Studio",
    description: "Encode or decode any payload with full UTF-8 support.",
    icon: Code2,
  },
  {
    id: "markdown",
    label: "Markdown Previewer",
    description: "Draft notes and see a live formatted preview instantly.",
    icon: FileText,
  },
];

const THEME_STORAGE_KEY = "dev-toolbox-pro:theme";
const UUID_HISTORY_KEY = "dev-toolbox-pro:uuid-history";
const PALETTE_FAVORITES_KEY = "dev-toolbox-pro:palette-favorites";

const isBrowser = typeof window !== "undefined";

function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (!isBrowser) {
      return defaultValue;
    }

    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) {
        return defaultValue;
      }
      return JSON.parse(stored) as T;
    } catch (error) {
      console.warn(`Failed to parse localStorage key ${key}:`, error);
      return defaultValue;
    }
  });

  const setPersistentValue = useCallback(
    (updater: SetStateAction<T>) => {
      setValue((previous) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: T) => T)(previous)
            : updater;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to persist localStorage key ${key}:`, error);
    }
  }, [key, value]);

  return [value, setPersistentValue];
}

function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (!isBrowser) {
      return "light";
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as
      | ThemeMode
      | null;
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((mode) => (mode === "light" ? "dark" : "light")),
    setTheme,
  };
}

async function copyToClipboard(value: string, success: string) {
  try {
    if (!value) {
      throw new Error("Nothing to copy yet.");
    }

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else if (isBrowser) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    toast({
      title: "Copied",
      description: success,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Copy to clipboard failed.";
    toast({
      title: "Unable to copy",
      description: message,
    });
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const VALID_HEX_REGEX = /^[0-9a-fA-F]{6}$/;
const SHORT_HEX_REGEX = /^[0-9a-fA-F]{3}$/;

function normalizeHex(hex: string): string {
  const trimmed = hex.trim().replace(/^#/, "").toLowerCase();

  if (VALID_HEX_REGEX.test(trimmed)) {
    return `#${trimmed}`.toUpperCase();
  }

  if (SHORT_HEX_REGEX.test(trimmed)) {
    const expanded = trimmed
      .split("")
      .map((char) => char + char)
      .join("");
    return `#${expanded}`.toUpperCase();
  }

  return "#529DFF";
}

type HslColor = {
  h: number;
  s: number;
  l: number;
};

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHex(hex).replace("#", "");
  const num = parseInt(normalized, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex({ r, g, b }: RgbColor) {
  const toHex = (component: number) =>
    component.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
      default:
        break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hueToRgb(p: number, q: number, t: number) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;

  if (saturation === 0) {
    const gray = Math.round(lightness * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const hFraction = ((h % 360) + 360) % 360;
  const hk = hFraction / 360;

  const r = Math.round(hueToRgb(p, q, hk + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, hk) * 255);
  const b = Math.round(hueToRgb(p, q, hk - 1 / 3) * 255);

  return { r, g, b };
}

function hslToHex(color: HslColor) {
  return rgbToHex(hslToRgb(color));
}

function generatePalette(baseHex: string) {
  const baseHsl = rgbToHsl(hexToRgb(baseHex));
  const shadeOffsets = [-28, -16, 0, 12, 22];
  const complementaryOffsets = [-12, 0, 12];

  const shades = shadeOffsets.map((offset) =>
    hslToHex({
      ...baseHsl,
      l: clamp(baseHsl.l + offset, 8, 94),
      s: clamp(baseHsl.s + offset / 2, 12, 96),
    }),
  );

  const complementary = complementaryOffsets.map((offset) =>
    hslToHex({
      h: (baseHsl.h + 180 + offset + 360) % 360,
      s: clamp(baseHsl.s + offset / 4, 18, 96),
      l: clamp(baseHsl.l + offset / 2, 10, 92),
    }),
  );

  return { shades, complementary };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function applyInlineFormatting(text: string) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const htmlParts: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      htmlParts.push(`<p>${applyInlineFormatting(paragraph.join("\n").trim())}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length) {
      const listHtml = listItems
        .map((item) => `<li>${applyInlineFormatting(item.trim())}</li>`)
        .join("");
      htmlParts.push(`<ul>${listHtml}</ul>`);
      listItems = [];
    }
  };

  const flushCode = () => {
    if (codeBuffer.length) {
      htmlParts.push(
        `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`
      );
      codeBuffer = [];
    }
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("```") && !inCodeBlock) {
      flushParagraph();
      flushList();
      inCodeBlock = true;
      return;
    }

    if (line.trim().startsWith("```") && inCodeBlock) {
      flushCode();
      inCodeBlock = false;
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const content = applyInlineFormatting(headingMatch[2].trim());
      htmlParts.push(`<h${level}>${content}</h${level}>`);
      return;
    }

    const listMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (listMatch) {
      flushParagraph(); // flush paragraph before adding list items
      listItems.push(listMatch[1].trim());
      return;
    }

    // If line is normal text, flush list first then add line to paragraph
    flushList();
    paragraph.push(line.trim());
  });

  if (inCodeBlock) {
    flushCode();
  }

  // Flush any remaining content
  flushParagraph();
  flushList();

  return htmlParts.join("");
}


const VALID_FLAGS = new Set(["g", "i", "m", "s", "u", "y"]);

function sanitizeFlags(flags: string) {
  return Array.from(new Set(flags.split("")))
    .filter((flag) => VALID_FLAGS.has(flag))
    .join("");
}

function ensureGlobalFlags(flags: string) {
  const sanitized = sanitizeFlags(flags);
  return sanitized.includes("g") ? sanitized : `${sanitized}g`;
}

function generateUuid() {
  if (isBrowser && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function ToolSidebar({
  activeTool,
  onSelect,
}: {
  activeTool: ToolId;
  onSelect: (tool: ToolId) => void;
}) {
  return (
    <aside className="hidden w-full max-w-xs flex-col gap-6 rounded-3xl border border-border/70 bg-card/70 p-6 shadow-soft backdrop-blur lg:flex">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
        <Layers className="h-5 w-5" />
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary/70">
            Dev Toolbox Pro
          </p>
          <p className="text-sm text-primary/60">
            6 essential utilities
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onSelect(tool.id)}
            className={cn(
              "group flex w-full items-start gap-3 rounded-2xl border border-transparent px-4 py-3 text-left transition-all",
              activeTool === tool.id
                ? "border-primary/60 bg-primary/10 shadow-inner"
                : "hover:border-border/60 hover:bg-secondary/50",
            )}
          >
            <tool.icon
              className={cn(
                "mt-1 h-5 w-5 transition-colors",
                activeTool === tool.id
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <div className="space-y-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  activeTool === tool.id
                    ? "text-foreground"
                    : "text-foreground/80",
                )}
              >
                {tool.label}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {tool.description}
              </p>
            </div>
          </button>
        ))}
      </nav>
      <div className="rounded-2xl border border-border/70 bg-background/80 p-4 text-xs text-muted-foreground">
        Tip: use Tab to jump between tabs instantly.
      </div>
    </aside>
  );
}

function ToolChips({
  activeTool,
  onSelect,
}: {
  activeTool: ToolId;
  onSelect: (tool: ToolId) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-card/70 p-2 shadow-soft backdrop-blur lg:hidden">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => onSelect(tool.id)}
          className={cn(
            "flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-all",
            activeTool === tool.id
              ? "bg-primary text-primary-foreground shadow-soft"
              : "bg-background/80 text-foreground/80 hover:bg-secondary",
          )}
        >
          <tool.icon className="h-4 w-4" />
          {tool.label}
        </button>
      ))}
    </div>
  );
}

function JsonFormatter() {
  const [input, setInput] = useState(
    `{
  "name": "Dev Toolbox Pro",
  "version": "1.0.0",
  "features": ["json-format", "palette", "uuid"]
}`,
  );
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const formatJson = useCallback(
    (spaces: number) => {
      try {
        if (!input.trim()) {
          setOutput("{}");
          setError("");
          return;
        }
        const parsed = JSON.parse(input);
        const formatted = JSON.stringify(parsed, null, spaces);
        setOutput(formatted);
        setError("");
      } catch (err) {
        setOutput("");
        setError(
          err instanceof Error
            ? err.message
            : "Unknown JSON parsing issue encountered.",
        );
      }
    },
    [input],
  );

  useEffect(() => {
    formatJson(2);
  }, [formatJson]);

  return (
    <Card className="border border-border/70 bg-card/70 shadow-soft backdrop-blur">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">JSON Formatter</CardTitle>
            <CardDescription>
              Format, validate, and minify JSON payloads with instant feedback.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => formatJson(2)}>
              <Sparkles className="h-4 w-4" /> Format
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => formatJson(0)}
            >
              <RefreshCw className="h-4 w-4" /> Minify
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-muted-foreground">
              Input JSON
            </label>
            <textarea
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="h-72 w-full resize-none rounded-2xl border border-border/70 bg-background/70 p-4 font-mono text-sm text-foreground shadow-inner focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-muted-foreground">
              Formatted Output
            </label>
            <textarea
              spellCheck={false}
              readOnly
              value={output}
              className="h-72 w-full resize-none rounded-2xl border border-border/70 bg-background/80 p-4 font-mono text-sm text-foreground shadow-inner"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(output, "Formatted JSON copied to clipboard.")}
                disabled={!output}
              >
                <Copy className="h-4 w-4" /> Copy JSON
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setInput("");
                  setOutput("");
                  setError("");
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UuidGenerator() {
  const [history, setHistory] = usePersistentState<string[]>(
    UUID_HISTORY_KEY,
    [],
  );
  const [current, setCurrent] = useState("");

  useEffect(() => {
    if (history.length > 0) {
      setCurrent(history[0]);
      return;
    }

    const initial = generateUuid();
    setHistory([initial]);
    setCurrent(initial);
  }, []);

  useEffect(() => {
    if (history.length > 0) {
      setCurrent(history[0]);
    }
  }, [history]);

  const generate = () => {
    const next = generateUuid();
    setHistory((previous) => {
      const filtered = previous.filter((item) => item !== next);
      return [next, ...filtered].slice(0, 5);
    });
    setCurrent(next);
    toast({
      title: "UUID ready",
      description: "Fresh identifier placed at the top of your history.",
    });
  };

  const clearHistory = () => {
    setHistory([]);
    setCurrent("");
  };

  return (
    <Card className="border border-border/70 bg-card/70 shadow-soft backdrop-blur">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">UUID Generator</CardTitle>
            <CardDescription>
              Generate RFC 4122 compliant identifiers with quick copy access.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={generate}>
              <RefreshCw className="h-4 w-4" /> Generate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(current, "UUID copied to clipboard.")}
              disabled={!current}
            >
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-6 font-mono text-lg tracking-wide text-primary">
          {current || "Generate a UUID to begin."}
        </div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Recent history
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearHistory}
            disabled={history.length === 0}
          >
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
        <div className="space-y-3">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Generate identifiers to populate your history trail.
            </p>
          )}
          {history.map((uuid, index) => (
            <div
              key={uuid}
              className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                <History className="h-4 w-4 text-primary" />
                <span className="font-mono">{uuid}</span>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">#{index + 1}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(uuid, "UUID copied from history.")}
                >
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ColorPalettePicker() {
  const [favorites, setFavorites] = usePersistentState<PaletteFavorite[]>(
    PALETTE_FAVORITES_KEY,
    [],
  );
  const [baseColor, setBaseColor] = useState("#529DFF");
  const [hexInput, setHexInput] = useState("#529DFF");

  useEffect(() => {
    const normalized = normalizeHex(hexInput);
    setBaseColor(normalized);
  }, [hexInput]);

  const palette = useMemo(() => generatePalette(baseColor), [baseColor]);

  const saveFavorite = () => {
    const normalizedBase = normalizeHex(baseColor);
    if (favorites.some((favorite) => favorite.base === normalizedBase)) {
      toast({
        title: "Already saved",
        description: "That palette is already pinned to your favorites.",
      });
      return;
    }

    const favorite: PaletteFavorite = {
      id: generateUuid(),
      base: normalizedBase,
      shades: palette.shades,
      complementary: palette.complementary,
      savedAt: Date.now(),
    };

    setFavorites((previous) => [favorite, ...previous].slice(0, 6));
    toast({
      title: "Palette saved",
      description: "Check the favorites rail for quick access.",
    });
  };

  const removeFavorite = (id: string) => {
    setFavorites((previous) => previous.filter((favorite) => favorite.id !== id));
  };

  const handleHexChange = (value: string) => {
    setHexInput(value.startsWith("#") ? value : `#${value}`);
  };

  const isValidHex =
    VALID_HEX_REGEX.test(hexInput.replace("#", "")) ||
    SHORT_HEX_REGEX.test(hexInput.replace("#", ""));

  return (
    <Card className="border border-border/70 bg-card/70 shadow-soft backdrop-blur">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">Color Palette Studio</CardTitle>
            <CardDescription>
              Build tonal ladders, complementary schemes, and save favorites.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label="Base color"
              type="color"
              value={baseColor}
              onChange={(event) => {
                setBaseColor(event.target.value.toUpperCase());
                setHexInput(event.target.value.toUpperCase());
              }}
              className="h-10 w-16 cursor-pointer rounded-xl border border-border/60 bg-transparent p-1"
            />
            <input
              aria-label="Hex color"
              value={hexInput.toUpperCase()}
              onChange={(event) => handleHexChange(event.target.value)}
              onBlur={(event) => setHexInput(normalizeHex(event.target.value))}
              className="h-10 w-28 rounded-xl border border-border/70 bg-background/80 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={saveFavorite}>
              <Star className="h-4 w-4" /> Save
            </Button>
          </div>
        </div>
        {!isValidHex && (
          <p className="text-xs text-destructive">
            Enter a valid hex value (3 or 6 characters).
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <PaletteIcon className="h-4 w-4" /> Tonal shades
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {palette.shades.map((shade) => (
              <div
                key={shade}
                className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 transition hover:-translate-y-1 hover:shadow-card"
              >
                <div
                  className="h-20 w-full rounded-xl"
                  style={{ background: shade }}
                />
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{shade}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(shade, `${shade} copied to clipboard.`)}
                    className="text-primary transition hover:text-primary/70"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ArrowLeftRight className="h-4 w-4" /> Complementary trio
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {palette.complementary.map((tone) => (
              <div
                key={tone}
                className="group rounded-2xl border border-border/60 bg-background/60 p-4 transition hover:-translate-y-1 hover:shadow-card"
              >
                <div
                  className="h-24 w-full rounded-xl"
                  style={{ background: tone }}
                />
                <div className="mt-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{tone}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(tone, `${tone} copied to clipboard.`)}
                    className="text-primary transition hover:text-primary/70"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Star className="h-4 w-4" /> Favorites
            </div>
            <Badge variant="secondary">
              {favorites.length} saved palette{favorites.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {favorites.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
              Save palettes to build your library of go-to color systems.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {favorites.map((favorite) => (
                <div
                  key={favorite.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/60 p-4"
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{favorite.base}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHexInput(favorite.base)}
                      >
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFavorite(favorite.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {favorite.shades.map((color) => (
                      <span
                        key={color}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-border/40 text-[10px] font-medium"
                        style={{ background: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function RegexTester() {
  const [pattern, setPattern] = useState("(tool)");
  const [flags, setFlags] = useState("gi");
  const [input, setInput] = useState(
    "Dev Toolbox Pro packs every tool into one delightful surface. These tools stay in sync."
  );
  const [replaceWith, setReplaceWith] = useState("utility");

  const { regex, error } = useMemo(() => {
    if (!pattern) {
      return { regex: null, error: "" };
    }

    try {
      const sanitized = sanitizeFlags(flags);
      return { regex: new RegExp(pattern, sanitized), error: "" };
    } catch (err) {
      return {
        regex: null,
        error:
          err instanceof Error
            ? err.message
            : "Unknown regular expression error.",
      };
    }
  }, [pattern, flags]);

  const matches = useMemo(() => {
    if (!regex || !pattern) {
      return [] as { value: string; index: number; groups: string[] }[];
    }

    try {
      const globalRegex = new RegExp(regex.source, ensureGlobalFlags(regex.flags));
      const entries = Array.from(input.matchAll(globalRegex));
      return entries.map((match) => ({
        value: match[0],
        index: match.index ?? 0,
        groups: match.slice(1),
      }));
    } catch (err) {
      console.warn("Regex execution error", err);
      return [];
    }
  }, [input, regex, pattern]);

  const highlightedInput = useMemo(() => {
    if (!regex || !pattern) {
      return escapeHtml(input).replace(/\n/g, "<br />");
    }

    try {
      const globalRegex = new RegExp(regex.source, ensureGlobalFlags(regex.flags));
      let result = "";
      let lastIndex = 0;
      for (const match of input.matchAll(globalRegex)) {
        const matchIndex = match.index ?? 0;
        const matchValue = match[0];
        result += escapeHtml(input.slice(lastIndex, matchIndex));
        result += `<mark class=\"rounded-md bg-primary/20 px-1 py-0.5 text-primary\">${escapeHtml(matchValue)}</mark>`;
        lastIndex = matchIndex + matchValue.length;
      }
      result += escapeHtml(input.slice(lastIndex));
      return result.replace(/\n/g, "<br />");
    } catch (err) {
      return escapeHtml(input).replace(/\n/g, "<br />");
    }
  }, [input, regex, pattern]);

  const replacePreview = useMemo(() => {
    if (!regex || !pattern) {
      return input;
    }

    try {
      const replaceRegex = new RegExp(regex.source, regex.flags);
      return input.replace(replaceRegex, replaceWith);
    } catch (err) {
      return input;
    }
  }, [input, regex, pattern, replaceWith]);

  return (
    <Card className="border border-border/70 bg-card/70 shadow-soft backdrop-blur">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">Regex Tester</CardTitle>
            <CardDescription>
              Experiment with patterns, flags, and live replacement previews.
            </CardDescription>
          </div>
          <Badge variant="secondary">Live preview</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[2fr,1fr]">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pattern
            </span>
            <input
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              className="h-11 rounded-xl border border-border/70 bg-background/80 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="(pattern)"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Flags
            </span>
            <input
              value={flags}
              onChange={(event) => setFlags(event.target.value)}
              className="h-11 rounded-xl border border-border/70 bg-background/80 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="gim"
            />
          </label>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sample text
          </span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="h-40 w-full rounded-2xl border border-border/70 bg-background/80 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">
              Highlighted matches
            </h4>
            <div
              className="min-h-[140px] rounded-2xl border border-border/70 bg-background/80 p-4 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlightedInput }}
            />
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">
              Replace preview
            </h4>
            <div className="min-h-[140px] w-full rounded-2xl border border-border/70 bg-background/80 p-4 text-sm">
              {replacePreview}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">
            Match details
          </h4>
          {matches.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 bg-background/60 p-3 text-sm text-muted-foreground">
              No matches yet. Adjust your pattern or flags.
            </p>
          ) : (
            <div className="space-y-2">
              {matches.map((match, index) => (
                <div
                  key={`${match.value}-${match.index}-${index}`}
                  className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <Regex className="h-4 w-4 text-primary" />
                    <span>{match.value}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Index: {match.index}</span>
                    {match.groups.length > 0 && (
                      <span>Groups: {match.groups.join(", ") || "—"}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Base64Studio() {
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState("Dev Toolbox Pro");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      if (mode === "encode") {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(input);
        let binary = "";
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        const encoded = isBrowser ? window.btoa(binary) : "";
        setOutput(encoded);
      } else {
        if (!input.trim()) {
          setOutput("");
        } else {
          const binary = isBrowser ? window.atob(input) : "";
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          const decoder = new TextDecoder();
          setOutput(decoder.decode(bytes));
        }
      }
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process Base64 conversion.",
      );
      setOutput("");
    }
  }, [input, mode]);

  return (
    <Card className="border border-border/70 bg-card/70 shadow-soft backdrop-blur">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">Base64 Studio</CardTitle>
            <CardDescription>
              Convert text to Base64 and decode payloads with UTF-8 safety.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-secondary/70 p-1">
            <Button
              size="sm"
              variant={mode === "encode" ? "default" : "ghost"}
              onClick={() => setMode("encode")}
            >
              Encode
            </Button>
            <Button
              size="sm"
              variant={mode === "decode" ? "default" : "ghost"}
              onClick={() => {
                setMode("decode");
                setInput("RGV2IFRvb2xib3ggUHJv");
              }}
            >
              Decode
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {mode === "encode" ? "Plain text" : "Base64 input"}
            </span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-h-[160px] w-full rounded-2xl border border-border/70 bg-background/80 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {mode === "encode" ? "Encoded output" : "Decoded output"}
            </span>
            <textarea
              readOnly
              value={output}
              className="min-h-[160px] w-full rounded-2xl border border-border/70 bg-background/80 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  copyToClipboard(output, "Base64 result copied to clipboard.")
                }
                disabled={!output}
              >
                <Copy className="h-4 w-4" /> Copy result
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setInput("");
                  setOutput("");
                  setError("");
                }}
                title="Clear both input and output"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </label>
        </div>
        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MarkdownPreviewer() {
  const [markdown, setMarkdown] = useState(
    `# Welcome to Dev Toolbox Pro\n\nCraft utilities faster with a modern interface.\n\n- JSON formatting\n- UUID history\n- Color palettes\n\n**Tip:** This renderer covers headings, lists, emphasis, inline code, and links.\n\n_This is **italics**_`,
  );

  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    const renderMarkdown = async () => {
      const rawHtml = await marked.parse(markdown);
      const cleanHtml = DOMPurify.sanitize(rawHtml);
      setHtml(cleanHtml);
    };
    renderMarkdown();
  }, [markdown]);
  
  return (
    <Card className="border border-border/70 bg-card/70 shadow-soft backdrop-blur">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">Markdown Previewer</CardTitle>
            <CardDescription>
              Draft copy and review a live, sanitized preview side-by-side.
            </CardDescription>
          </div>
          <Badge variant="secondary">Lightweight renderer</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left column: Markdown input */}
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Markdown input
            </span>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              className="min-h-[280px] w-full rounded-2xl border border-border/70 bg-background/80 p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {/* Right column: Preview */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preview
            </span>
            <div
              className="markdown-preview prose prose-sm max-w-none rounded-2xl border border-border/70 bg-background/80 p-6 text-foreground dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        {/* Buttons below the grid, aligned right (under Preview) */}
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(markdown)}
            disabled={!markdown.trim()}
          >
            <Copy className="h-4 w-4 mr-2" /> Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMarkdown("")}>
            <Trash2 className="h-4 w-4 mr-2" /> Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
export default function Index() {
  const { theme, toggle } = useThemeMode();
  const [activeTool, setActiveTool] = useState<ToolId>("json");

  const renderActiveTool = () => {
    switch (activeTool) {
      case "json":
        return <JsonFormatter />;
      case "uuid":
        return <UuidGenerator />;
      case "palette":
        return <ColorPalettePicker />;
      case "regex":
        return <RegexTester />;
      case "base64":
        return <Base64Studio />;
      case "markdown":
        return <MarkdownPreviewer />;
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-radial-glow opacity-60" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-stripes opacity-80 dark:opacity-60" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-8 lg:flex-row lg:gap-8 lg:px-8">
        <ToolSidebar activeTool={activeTool} onSelect={setActiveTool} />
        <div className="flex flex-1 flex-col gap-6">
          <header className="space-y-5 rounded-3xl border border-border/70 bg-card/70 p-6 shadow-soft backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> Pro toolkit
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold md:text-4xl">
                    Dev Toolbox Pro
                  </h1>
                  <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                    A curated workstation for developers. Switch between
                    formatter, generators, testers, and previewers without
                    leaving the canvas.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-start md:self-auto">
                <Badge variant="secondary">v1.0</Badge>
                <Button variant="outline" onClick={toggle} size="sm">
                  {theme === "light" ? (
                    <>
                      <Moon className="h-4 w-4" /> Dark
                    </>
                  ) : (
                    <>
                      <SunMedium className="h-4 w-4" /> Light
                    </>
                  )}
                </Button>
              </div>
            </div>
            {/* <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">Utilities</p>
                <p className="text-xl font-semibold">6 tools</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">History</p>
                <p className="text-xl font-semibold">UUID & palettes</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">Theme</p>
                <p className="text-xl font-semibold">
                  {theme === "light" ? "Light" : "Dark"} mode
                </p>
              </div>
            </div> */}
          </header>
          <ToolChips activeTool={activeTool} onSelect={setActiveTool} />
          <section className="flex-1 space-y-6 pb-12">
            {renderActiveTool()}
          </section>
        </div>
      </div>
    </div>
  );
}
