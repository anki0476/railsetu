export type JamvantaAction =
  | { type: 'plan_journey'; from?: string; to?: string; date?: string; passengerCount?: number; travelClass?: string; search?: boolean; autoContinue?: boolean }
  | { type: 'continue_to_payment' }
  | { type: 'select_wallet' }
  | { type: 'pay_with_wallet'; approvalId: string }
  | { type: 'list_payment_methods'; methodType: 'upi' | 'card' }
  | { type: 'add_payment_method'; methodType: 'upi' | 'card' }
  | { type: 'pay_with_method'; mode: string; label: string; approvalId: string }
  | { type: 'download_ticket' }
  | { type: 'navigate'; path: '/planner' | '/about' | '/' };

export type JamvantaTurn = {
  reply: string;
  language: 'en-IN' | 'hi-IN';
  action?: JamvantaAction;
  clarification?: boolean;
  requiresApproval?: boolean;
  approvalLabel?: string;
};

export const JAMVANTA_ACTION_EVENT = 'railsetu:jamvanta-action';
export const JAMVANTA_FEEDBACK_EVENT = 'railsetu:jamvanta-feedback';
const JAMVANTA_PENDING_ACTION_KEY = 'railsetu.jamvanta-pending-action.v1';

export function dispatchJamvantaAction(action: JamvantaAction) {
  window.dispatchEvent(new CustomEvent<JamvantaAction>(JAMVANTA_ACTION_EVENT, { detail: action }));
}

export function dispatchJamvantaFeedback(message: string, action?: JamvantaAction) {
  window.dispatchEvent(new CustomEvent(JAMVANTA_FEEDBACK_EVENT, { detail: { message, action } }));
}

export function routeJamvantaAction(action: JamvantaAction) {
  if (action.type === 'navigate') {
    window.location.assign(action.path);
    return;
  }
  if (action.type === 'plan_journey' && window.location.pathname !== '/planner') {
    window.sessionStorage.setItem(JAMVANTA_PENDING_ACTION_KEY, JSON.stringify(action));
    window.location.assign('/planner');
    return;
  }
  dispatchJamvantaAction(action);
}

export function takePendingJamvantaAction() {
  try {
    const raw = window.sessionStorage.getItem(JAMVANTA_PENDING_ACTION_KEY);
    window.sessionStorage.removeItem(JAMVANTA_PENDING_ACTION_KEY);
    if (!raw) return null;
    const action = JSON.parse(raw) as JamvantaAction;
    return action?.type === 'plan_journey' ? action : null;
  } catch {
    return null;
  }
}
