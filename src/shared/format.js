// 위젯과 상세 패널이 함께 쓰는 표시 포맷.
//
// 두 렌더러가 같은 시각을 다르게 적으면 곧바로 사용자 눈에 띄고, 한쪽만 고치는 사고가 난다.
// contextIsolation 때문에 모듈 시스템이 없으므로 전역 하나에 얹는다.
(function (global) {
  let dict = {};

  function setDict(d) {
    dict = d || {};
  }

  function t(key, ...args) {
    let v = dict[key];
    if (v == null) return key;
    if (typeof v === 'string' && args.length) {
      v = v.replace(/\{(\d+)\}/g, (_, i) => {
        const val = args[Number(i)];
        return val == null ? '' : String(val);
      });
    }
    return v;
  }

  function weekdays() {
    return dict['widget.weekdays'] || ['일', '월', '화', '수', '목', '금', '토'];
  }

  function parts(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const h = d.getHours();
    return {
      d,
      time: `${h < 12 ? t('widget.am') : t('widget.pm')} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}`,
      sameDay: (() => {
        const now = new Date();
        return d.getFullYear() === now.getFullYear()
          && d.getMonth() === now.getMonth()
          && d.getDate() === now.getDate();
      })()
    };
  }

  /** 남은 시간. "1시간 23분 후" / "2일 18시간 후" */
  function untilHuman(iso) {
    if (!iso) return '--';
    const diff = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(diff) || diff <= 0) return t('widget.resetsSoon');
    const mins = Math.floor(diff / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (days >= 1) return t('widget.daysLater', days, hours);
    if (hours >= 1) return t('widget.hoursLater', hours, m);
    return t('widget.minsLater', m);
  }

  /** 위젯 본문용 짧은 표기. 폭이 좁으므로 다른 날이어도 요일만 붙인다. */
  function resetAtLabel(iso) {
    if (!iso) return '--';
    const p = parts(iso);
    if (!p) return '--';
    if (p.sameDay) return p.time;
    return `${p.time} (${weekdays()[p.d.getDay()]})`;
  }

  /** 패널용 전체 표기. 폭 여유가 있으므로 며칠 뒤인지 알 수 있게 월/일까지 적는다. */
  function resetAtFull(iso) {
    if (!iso) return '--';
    const p = parts(iso);
    if (!p) return '--';
    if (p.sameDay) return p.time;
    return `${p.d.getMonth() + 1}/${p.d.getDate()} (${weekdays()[p.d.getDay()]}) ${p.time}`;
  }

  /** 0~100 으로 다듬은 정수 퍼센트. 값이 없으면 null. */
  function pct(v) {
    if (v == null || Number.isNaN(v)) return null;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  /** 임계값은 위젯과 패널이 같아야 한다. */
  function levelOf(p) {
    if (p == null) return null;
    if (p >= 90) return 'danger';
    if (p >= 70) return 'warn';
    return null;
  }

  global.csFormat = { setDict, t, untilHuman, resetAtLabel, resetAtFull, pct, levelOf };
})(window);
