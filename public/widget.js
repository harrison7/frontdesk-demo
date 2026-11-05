// @ts-check
/**
 * Front desk chat widget: a self-contained script any website can embed.
 *
 *   <script src="https://YOUR-HOST/widget.js" data-frontdesk-widget
 *           data-api="https://YOUR-HOST" data-business="Timpanogos Heating & Plumbing"
 *           data-phone="(801) 555-0142" defer></script>
 *
 * Design choices:
 * - Plain JavaScript with no build step and no dependencies, so it is one file a
 *   site owner can drop in.
 * - Rendered inside a Shadow DOM, so the host page's CSS cannot break the
 *   widget and the widget's CSS cannot leak into the host page.
 * - All server text is inserted with textContent, never innerHTML, so even a
 *   compromised reply cannot inject markup or scripts into the host page.
 */
(function () {
  if (window.__frontdeskWidgetLoaded) return;
  window.__frontdeskWidgetLoaded = true;

  /** @type {HTMLScriptElement | null} */
  const script =
    /** @type {HTMLScriptElement | null} */ (document.currentScript) ||
    document.querySelector("script[data-frontdesk-widget]");
  const data = script ? script.dataset : {};
  const apiBase = (data.api || (script ? new URL(script.src).origin : "")).replace(/\/+$/, "");
  const businessName = data.business || "our team";
  const phone = data.phone || "";

  /** @type {{ role: "user" | "assistant", content: string }[]} */
  const history = [];

  const host = document.createElement("div");
  host.id = "frontdesk-widget";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
        background: #0f4c81; color: #fff; border: 0; border-radius: 999px; padding: 14px 20px;
        font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
      .launcher:focus-visible, button:focus-visible, input:focus-visible { outline: 3px solid #f2a900; outline-offset: 2px; }
      .panel { position: fixed; right: 20px; bottom: 84px; z-index: 2147483000; width: min(380px, calc(100vw - 32px));
        height: min(560px, calc(100vh - 120px)); background: #fff; color: #1b1f24; border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.28); display: none; flex-direction: column; overflow: hidden; }
      .panel.open { display: flex; }
      header { background: #0f4c81; color: #fff; padding: 12px 14px; display: flex; align-items: center; gap: 8px; }
      header .title { font-weight: 700; font-size: 15px; flex: 1; }
      header .sub { font-size: 11px; opacity: .85; display: block; font-weight: 400; }
      header button { background: transparent; border: 0; color: #fff; font-size: 22px; cursor: pointer; line-height: 1; }
      .log { position: relative; flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: #f5f7fa; }
      .msg { max-width: 88%; padding: 9px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
      .user { align-self: flex-end; background: #0f4c81; color: #fff; border-bottom-right-radius: 4px; }
      .bot { align-self: flex-start; background: #fff; border: 1px solid #dde3ea; border-bottom-left-radius: 4px; }
      .safety { align-self: stretch; background: #fff1f0; border: 2px solid #c62828; color: #7f1d1d;
        border-radius: 10px; padding: 10px 12px; font-size: 14px; line-height: 1.45; }
      .safety strong { display: block; margin-bottom: 4px; color: #b71c1c; }
      .sources { margin-top: 6px; font-size: 12px; color: #4a5560; }
      .sources ol { margin: 2px 0 0; padding-left: 0; list-style: none; }
      .handoff { margin-top: 8px; background: #fff; border: 1px solid #0f4c81; color: #0f4c81; border-radius: 8px;
        padding: 6px 10px; font-size: 13px; cursor: pointer; font-weight: 600; }
      .typing { color: #6b7785; font-style: italic; }
      form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #dde3ea; background: #fff; }
      input { flex: 1; border: 1px solid #b9c3cd; border-radius: 8px; padding: 10px; font-size: 14px; }
      form button { background: #0f4c81; color: #fff; border: 0; border-radius: 8px; padding: 0 14px; font-weight: 600; cursor: pointer; }
      form button:disabled { opacity: .5; cursor: default; }
      .foot { font-size: 11px; color: #6b7785; text-align: center; padding: 0 10px 8px; background: #fff; }
    </style>
    <button class="launcher" type="button" aria-expanded="false" aria-controls="fd-panel">Chat with us</button>
    <section class="panel" id="fd-panel" role="dialog" aria-label="Chat with the front desk">
      <header>
        <span class="title">Front desk<span class="sub">AI assistant · demo with made-up info</span></span>
        <button class="close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="log" role="log" aria-live="polite"></div>
      <form>
        <label for="fd-input" style="position:absolute;left:-9999px">Your question</label>
        <input id="fd-input" name="message" autocomplete="off" maxlength="1000"
               placeholder="Ask about services, prices, hours..." />
        <button type="submit">Send</button>
      </form>
      <div class="foot">Answers come from the company's documents. Not for emergencies: call 911.</div>
    </section>`;

  const launcher = /** @type {HTMLButtonElement} */ (root.querySelector(".launcher"));
  const panel = /** @type {HTMLElement} */ (root.querySelector(".panel"));
  const log = /** @type {HTMLElement} */ (root.querySelector(".log"));
  const form = /** @type {HTMLFormElement} */ (root.querySelector("form"));
  const input = /** @type {HTMLInputElement} */ (root.querySelector("input"));
  const send = /** @type {HTMLButtonElement} */ (root.querySelector("form button"));
  const closeBtn = /** @type {HTMLButtonElement} */ (root.querySelector(".close"));

  function setOpen(/** @type {boolean} */ open) {
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  }
  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  closeBtn.addEventListener("click", () => {
    setOpen(false);
    launcher.focus();
  });

  /** Creates an element with text content (never HTML). */
  function el(
    /** @type {string} */ tag,
    /** @type {string} */ className,
    /** @type {string} */ text,
  ) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function addMessage(/** @type {"user" | "bot"} */ who, /** @type {string} */ text) {
    const node = el("div", `msg ${who}`, text);
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }

  /**
   * @param {{ outcome: string, safety: {kind: string, message: string}[], answer: string,
   *   citations: {n: number, docTitle: string, section: string}[], handoff: boolean }} reply
   */
  function renderReply(reply) {
    const replyStart = log.lastElementChild; // the reply's nodes are appended after this
    // Safety alerts always come first, visually separate from the answer.
    for (const alert of reply.safety) {
      const box = el("div", "safety", "");
      box.setAttribute("role", "alert");
      box.appendChild(el("strong", "", "Safety first"));
      box.appendChild(document.createTextNode(alert.message));
      log.appendChild(box);
    }

    const bubble = addMessage("bot", reply.answer);
    if (reply.citations.length > 0) {
      const sources = el("div", "sources", "Sources:");
      const list = document.createElement("ol");
      for (const c of reply.citations) {
        list.appendChild(el("li", "", `[${c.n}] ${c.docTitle} › ${c.section}`));
      }
      sources.appendChild(list);
      bubble.appendChild(sources);
    }
    if (reply.handoff) {
      const btn = /** @type {HTMLButtonElement} */ (el("button", "handoff", "Talk to a person"));
      btn.type = "button";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        addMessage(
          "bot",
          `Happy to connect you with ${businessName}.` +
            (phone ? ` Please call ${phone} during office hours.` : "") +
            " (In a later version, I'll be able to take your details and book a time.)",
        );
      });
      bubble.appendChild(btn);
    }
    // Scroll to the *start* of the reply, not the bottom of the log. Otherwise
    // a long answer pushes the safety alert out of view, and it is the part
    // that must be read first.
    const first = /** @type {HTMLElement | null} */ (
      replyStart ? replyStart.nextElementSibling : log.firstElementChild
    );
    log.scrollTop = first ? first.offsetTop - 8 : log.scrollHeight;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    send.disabled = true;
    addMessage("user", message);
    const typing = addMessage("bot", "Looking that up...");
    typing.classList.add("typing");

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(-6) }),
      });
      const body = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok) {
        addMessage(
          "bot",
          body.error || body.fallback || "Sorry, something went wrong. Please call us instead.",
        );
        return;
      }
      renderReply(body);
      history.push({ role: "user", content: message }, { role: "assistant", content: body.answer });
    } catch {
      typing.remove();
      addMessage(
        "bot",
        `Sorry, I couldn't reach the server.${phone ? ` Please call ${phone}.` : ""}`,
      );
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  addMessage(
    "bot",
    `Hi! I'm the virtual front desk for ${businessName}. Ask me about services, prices, hours, ` +
      "our service area, warranties, or maintenance plans.",
  );
})();
