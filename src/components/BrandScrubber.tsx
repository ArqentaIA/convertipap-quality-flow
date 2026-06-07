import { useEffect } from "react";

/**
 * BrandScrubber: garantiza que la marca "Lovable" nunca se renderice
 * en el cliente. Recorre el DOM y elimina cualquier nodo (texto, badge,
 * iframe, enlace, meta) que contenga la cadena, incluyendo el badge
 * inyectado por el editor en el preview. Se ejecuta al montar y observa
 * cambios continuos vía MutationObserver.
 */
const PATTERN = /lovable/i;

function scrubNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent && PATTERN.test(node.textContent)) {
      node.textContent = node.textContent.replace(/lovable/gi, "");
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;

  // Atributos sensibles
  for (const attr of ["alt", "title", "aria-label", "placeholder"]) {
    const v = el.getAttribute?.(attr);
    if (v && PATTERN.test(v)) el.setAttribute(attr, v.replace(/lovable/gi, ""));
  }

  // Enlaces/iframes hacia lovable.*
  const href = el.getAttribute?.("href");
  const src = el.getAttribute?.("src");
  if ((href && PATTERN.test(href)) || (src && PATTERN.test(src))) {
    el.remove();
    return;
  }

  // Badge inyectado por el editor
  if (
    el.id === "lovable-badge" ||
    el.getAttribute?.("data-lovable-badge") !== null ||
    (el.className && typeof el.className === "string" && PATTERN.test(el.className))
  ) {
    el.remove();
    return;
  }

  // Recorrer hijos
  el.childNodes.forEach(scrubNode);
}

function scrubMeta() {
  document.querySelectorAll("meta").forEach((m) => {
    const c = m.getAttribute("content");
    if (c && PATTERN.test(c)) m.setAttribute("content", c.replace(/lovable/gi, ""));
  });
  const title = document.querySelector("title");
  if (title?.textContent && PATTERN.test(title.textContent)) {
    title.textContent = title.textContent.replace(/lovable/gi, "");
  }
}

export function BrandScrubber() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const run = () => {
      try {
        scrubNode(document.body);
        scrubMeta();
      } catch {
        /* noop */
      }
    };
    run();
    const obs = new MutationObserver(() => run());
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "src", "alt", "title", "aria-label", "class", "id"],
    });
    return () => obs.disconnect();
  }, []);
  return null;
}

export default BrandScrubber;
