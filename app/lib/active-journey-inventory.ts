import type { JourneyInventoryProvider } from './journey-inventory-provider';
import { mockJourneyInventoryProvider } from './mock-journey-inventory';

/**
 * Single integration seam for inventory. Replace this binding with an adapter
 * backed by an authorised live railway API; the solver, API, cache, and UI do
 * not need to change.
 */
export const activeJourneyInventoryProvider: JourneyInventoryProvider = mockJourneyInventoryProvider;

