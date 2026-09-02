import { escapeHtml, resolveProjectUrl } from '../game/base';
import { householdVerificationIsOperator } from '../game/household-verification';

export function hasOperatorAccess(): boolean {
  return householdVerificationIsOperator();
}

export function guardOperatorPage(pageName: string): boolean {
  if (hasOperatorAccess()) {
    document.documentElement.dataset.operatorAccess = 'true';
    return true;
  }
  document.documentElement.dataset.operatorAccess = 'required';
  document.title = `운영자 인증 필요 · ${pageName}`;
  document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#071216;color:#dceae6;font-family:system-ui,sans-serif">
    <section style="width:min(520px,100%);padding:32px;border:1px solid rgba(112,217,195,.22);border-radius:12px;background:#0d1d21;box-shadow:0 24px 70px rgba(0,0,0,.35)">
      <p style="margin:0 0 8px;color:#70d9c3;font:800 11px ui-monospace,monospace;letter-spacing:.14em">OPERATOR ACCESS</p>
      <h1 style="margin:0 0 12px;font-size:24px">${escapeHtml(pageName)}는 운영자 전용입니다.</h1>
      <p style="margin:0 0 22px;color:#91aaa5;line-height:1.65">세대·타입·닉네임 인증 상태가 <b style="color:#d9b968">운영자</b>인 현재 탭에서만 이 메뉴를 사용할 수 있습니다.</p>
      <a href="${resolveProjectUrl('')}" style="display:inline-flex;min-height:42px;align-items:center;padding:0 16px;border-radius:7px;color:#061411;background:#70d9c3;font-weight:800;text-decoration:none">인증 화면으로 돌아가기</a>
    </section>
  </main>`;
  return false;
}
