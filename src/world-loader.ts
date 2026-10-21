type WorldModule = typeof import("./world/World");
const deadline = async <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("3D 화면 응답이 늦습니다. 다시 시도해 주세요.")), 12000);
    })]);
  } finally { clearTimeout(timer); }
};
/** A failed ES module can remain cached across reloads in WebKit. Retry a distinct URL. */
export async function retryWorldModule(): Promise<WorldModule> {
  const attempt = crypto.randomUUID(), abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 12000);
  const links: HTMLLinkElement[] = [];
  try {
    const response = await fetch("/build-manifest.json?retry=" + attempt, { cache: "no-store", signal: abort.signal });
    if (!response.ok) throw new Error("3D 화면 정보를 가져오지 못했습니다.");
    const manifest = await response.json() as Record<string, { file: string; css?: string[] }>;
    const main = manifest["index.html"];
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    if (!main || !/^assets\/[a-zA-Z0-9_-]+\.js$/.test(main.file) || !script) throw new Error("화면 버전을 확인할 수 없습니다.");
    if (new URL(script.src).pathname !== "/" + main.file) {
      // A new World imports its matching entry module; never mix two app builds.
      const next = new URL(location.href); next.searchParams.set("biz_build", attempt);
      location.replace(next.href);
      throw new Error("새 버전의 화면으로 이동합니다.");
    }
    const entry = manifest["src/world/World.tsx"];
    if (!entry || !/^assets\/[a-zA-Z0-9_-]+\.js$/.test(entry.file)) throw new Error("3D 화면 정보를 확인할 수 없습니다.");
    await Promise.all((entry.css || []).map(async file => {
      if (!/^assets\/[a-zA-Z0-9_-]+\.css$/.test(file)) throw new Error("3D 화면 스타일을 확인할 수 없습니다.");
      const link = document.createElement("link"); links.push(link);
      link.rel = "stylesheet"; link.href = "/" + file + "?retry=" + attempt; link.dataset.worldRetry = attempt;
      await deadline(new Promise<void>((resolve, reject) => {
        link.onload = () => resolve(); link.onerror = () => reject(new Error("3D 화면 스타일을 가져오지 못했습니다."));
        document.head.appendChild(link);
      }));
    }));
    const moduleUrl = new URL("/" + entry.file, location.origin);
    moduleUrl.searchParams.set("retry", attempt);
    const world = await deadline(import(/* @vite-ignore */ moduleUrl.href) as Promise<WorldModule>);
    document.querySelectorAll<HTMLLinkElement>("link[data-world-retry]").forEach(link => { if (link.dataset.worldRetry !== attempt) link.remove(); });
    return world;
  } catch (error) {
    links.forEach(link => link.remove());
    throw error;
  } finally { clearTimeout(timer); }
}
