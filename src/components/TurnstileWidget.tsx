import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const SCRIPT_ID = "cf-turnstile-api";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstileScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Turnstile failed to load"));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Turnstile failed to load")),
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile failed to load"));
    };
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
}

export type TurnstileWidgetHandle = {
  reset: () => void;
};

type Props = {
  action: "register" | "login";
  onToken: (token: string | null) => void;
  widgetRef?: MutableRefObject<TurnstileWidgetHandle | null>;
};

export default function TurnstileWidget({ action, onToken, widgetRef }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let api: TurnstileApi | null = null;

    async function mount() {
      setError(null);
      onToken(null);
      try {
        const cfgRes = await fetch("/api/auth/turnstile");
        if (!cfgRes.ok) {
          throw new Error("Turnstile not available");
        }
        const cfg = (await cfgRes.json()) as { siteKey?: string };
        const siteKey = cfg.siteKey?.trim();
        if (!siteKey) throw new Error("Turnstile not available");

        api = await loadTurnstileScript();
        if (cancelled || !hostRef.current) return;

        if (widgetIdRef.current) {
          api.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
        hostRef.current.innerHTML = "";

        const id = api.render(hostRef.current, {
          sitekey: siteKey,
          action,
          callback: (token) => {
            if (!cancelled) onToken(token);
          },
          "expired-callback": () => {
            if (!cancelled) onToken(null);
          },
          "error-callback": () => {
            if (!cancelled) onToken(null);
          },
        });
        widgetIdRef.current = id;

        if (widgetRef) {
          widgetRef.current = {
            reset: () => {
              if (widgetIdRef.current && window.turnstile) {
                window.turnstile.reset(widgetIdRef.current);
              }
              onToken(null);
            },
          };
        }
      } catch {
        if (!cancelled) {
          setError("Could not load verification. Refresh and try again.");
          onToken(null);
        }
      }
    }

    void mount();

    return () => {
      cancelled = true;
      if (widgetRef) widgetRef.current = null;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Remount when action changes; onToken/widgetRef are stable enough for pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount deps
  }, [action]);

  return (
    <Box>
      <div ref={hostRef} />
      {error ? (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      ) : null}
    </Box>
  );
}
