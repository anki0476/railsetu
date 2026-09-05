export type JamvantaAction =
  | { type: 'plan_journey'; from?: string; to?: string; date?: string; passengerCount?: number; travelClass?: string; search?: boolean }
  | { type: 'continue_to_payment' }
  | { type: 'select_wallet' }
  | { type: 'pay_with_wallet'; approvalId: string }
  | { type: 'download_ticket' }
  | { type: 'navigate'; path: '/planner' | '/about' | '/' };

export type JamvantaTurn = {
  reply: string;
  language: 'en-IN' | 'hi-IN';
  action?: JamvantaAction;
  requiresApproval?: boolean;
  approvalLabel?: string;
};

export const JAMVANTA_ACTION_EVENT = 'railsetu:jamvanta-action';

export function dispatchJamvantaAction(action: JamvantaAction) {
  window.dispatchEvent(new CustomEvent<JamvantaAction>(JAMVANTA_ACTION_EVENT, { detail: action }));
}

