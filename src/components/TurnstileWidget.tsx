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
  const onTokenRef = useRef(onToken);
  const widgetHandleRef = useRef(widgetRef);
  const [error, setError] = useState<string | null>(null);
  onTokenRef.current = onToken;
  widgetHandleRef.current = widgetRef;

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      setError(null);
      onTokenRef.current(null);
      try {
        const cfgRes = await fetch("/api/auth/turnstile");
        if (!cfgRes.ok) {
          throw new Error("Turnstile not available");
        }
        const cfg = (await cfgRes.json()) as { siteKey?: string };
        const siteKey = cfg.siteKey?.trim();
        if (!siteKey) throw new Error("Turnstile not available");

        const api = await loadTurnstileScript();
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
            if (!cancelled) onTokenRef.current(token);
          },
          "expired-callback": () => {
            if (!cancelled) onTokenRef.current(null);
          },
          "error-callback": () => {
            if (!cancelled) onTokenRef.current(null);
          },
        });
        widgetIdRef.current = id;

        const handleRef = widgetHandleRef.current;
        if (handleRef) {
          handleRef.current = {
            reset: () => {
              if (widgetIdRef.current && window.turnstile) {
                window.turnstile.reset(widgetIdRef.current);
              }
              onTokenRef.current(null);
            },
          };
        }
      } catch {
        if (!cancelled) {
          setError("Could not load verification. Refresh and try again.");
          onTokenRef.current(null);
        }
      }
    }

    void mount();

    return () => {
      cancelled = true;
      const handleRef = widgetHandleRef.current;
      if (handleRef) handleRef.current = null;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
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
