'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

export type SiteLanguage = 'en' | 'hi';

type SiteLanguageContextValue = {
  language: SiteLanguage;
  setLanguage: (language: SiteLanguage) => void;
};

type RenderState = {
  source: string;
  rendered: string;
};

const LANGUAGE_STORAGE_KEY = 'railsetu.language.v1';
const LANGUAGE_CHANGE_EVENT = 'railsetu:language-change';
let sessionLanguage: SiteLanguage = 'en';
const LOCALIZED_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;
const ignoredParents = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const textStates = new WeakMap<Text, RenderState>();
const attributeStates = new WeakMap<Element, Map<string, RenderState>>();
const SiteLanguageContext = createContext<SiteLanguageContextValue | null>(null);
let translateHindi = (text: string) => text;
let hindiTranslations: Promise<typeof import('../lib/hindi-translations')> | null = null;

function loadHindiTranslations() {
  hindiTranslations ??= import('../lib/hindi-translations');
  return hindiTranslations;
}

function readLanguage(): SiteLanguage {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'hi' || stored === 'en') sessionLanguage = stored;
    return sessionLanguage;
  } catch {
    return sessionLanguage;
  }
}

function subscribeToLanguage(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);
  };
}

function withOriginalSpacing(source: string, translation: string) {
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translation}${trailing}`;
}

function localizeTextNode(node: Text, language: SiteLanguage) {
  if (node.parentElement && ignoredParents.has(node.parentElement.tagName)) return;
  const current = node.nodeValue ?? '';
  let state = textStates.get(node);
  if (!state) {
    state = { source: current, rendered: current };
    textStates.set(node, state);
  } else if (current !== state.rendered) {
    state.source = current;
  }

  const trimmed = state.source.trim();
  const next = language === 'hi' && trimmed
    ? withOriginalSpacing(state.source, translateHindi(trimmed))
    : state.source;
  state.rendered = next;
  if (current !== next) node.nodeValue = next;
}

function localizeElementAttributes(element: Element, language: SiteLanguage) {
  let states = attributeStates.get(element);
  if (!states) {
    states = new Map();
    attributeStates.set(element, states);
  }

  LOCALIZED_ATTRIBUTES.forEach((attribute) => {
    const current = element.getAttribute(attribute);
    if (current === null) return;
    let state = states?.get(attribute);
    if (!state) {
      state = { source: current, rendered: current };
      states?.set(attribute, state);
    } else if (current !== state.rendered) {
      state.source = current;
    }
    const next = language === 'hi' ? translateHindi(state.source) : state.source;
    state.rendered = next;
    if (current !== next) element.setAttribute(attribute, next);
  });
}

function localizeSubtree(root: Node, language: SiteLanguage) {
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root as Text, language);
    return;
  }
  if (!(root instanceof Element) && root !== document) return;

  if (root instanceof Element) localizeElementAttributes(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) localizeTextNode(current as Text, language);
    else localizeElementAttributes(current as Element, language);
    current = walker.nextNode();
  }
}

export function SiteLanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeToLanguage, readLanguage, () => 'en');

  useEffect(() => {
    document.documentElement.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    document.documentElement.classList.toggle('railsetu-hindi', language === 'hi');
    let observer: MutationObserver | null = null;
    let cancelled = false;

    const beginLocalization = () => {
      if (cancelled) return;
      localizeSubtree(document.documentElement, language);
      observer = new MutationObserver((records) => {
        records.forEach((record) => {
          if (record.type === 'characterData') localizeTextNode(record.target as Text, language);
          if (record.type === 'attributes') localizeElementAttributes(record.target as Element, language);
          record.addedNodes.forEach((node) => localizeSubtree(node, language));
        });
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...LOCALIZED_ATTRIBUTES],
      });
    };

    if (language === 'hi') {
      void loadHindiTranslations().then((module) => {
        translateHindi = module.translateHindi;
        beginLocalization();
      });
    } else beginLocalization();

    return () => { cancelled = true; observer?.disconnect(); };
  }, [language]);

  const setLanguage = useCallback((nextLanguage: SiteLanguage) => {
    sessionLanguage = nextLanguage;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // The selected language still applies for the current session.
    }
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <SiteLanguageContext.Provider value={value}>{children}</SiteLanguageContext.Provider>;
}

export function useSiteLanguage() {
  const context = useContext(SiteLanguageContext);
  if (!context) throw new Error('useSiteLanguage must be used inside SiteLanguageProvider.');
  return context;
}
