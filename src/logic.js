
class Component extends DCLogic {
  state = { screen: 'home', approved: false, dark: null, colIdx: 0, meetSel: { C: true, G: true, Ge: false, CC: false, D: false, PC: false }, reqOpen: false, reqSent: false, reqSel: 0, promptIdx: 0, ran: false, plugIdx: 0, plugConn: { C: true, G: true, Ge: true, CC: true, D: true, PC: false, MCP: false },
    // --- Live DeepSeek meeting state (real network, no hard-coded key) ---
    liveMsgs: [], missionInput: '', sending: false, keyTick: 0 };

  go(screen) { this.setState({ screen }); }

  // ===================== DeepSeek integration =====================
  // Config is read at runtime from localStorage only; no key ever lives in code.
  DS_KEY_LS = 'cooktop_deepseek_key';
  DS_WORKER_LS = 'cooktop_worker_url';

  dsWorkerUrl() { try { return (localStorage.getItem(this.DS_WORKER_LS) || '').trim(); } catch (e) { return ''; } }
  dsStoredKey() { try { return (localStorage.getItem(this.DS_KEY_LS) || '').trim(); } catch (e) { return ''; } }

  // Returns a usable key, prompting the user in-browser the first time. Never logged.
  dsEnsureKey() {
    let k = this.dsStoredKey();
    if (!k) {
      k = (window.prompt('Enter your DeepSeek API key (stored only in this browser, never sent to anyone but DeepSeek):') || '').trim();
      if (k) { try { localStorage.setItem(this.DS_KEY_LS, k); } catch (e) {} this.setState(st => ({ keyTick: st.keyTick + 1 })); }
    }
    return k;
  }
  dsSetKey() {
    const cur = this.dsStoredKey();
    const k = (window.prompt('DeepSeek API key (stored only in this browser):', cur) || '').trim();
    if (k) { try { localStorage.setItem(this.DS_KEY_LS, k); } catch (e) {} }
    this.setState(st => ({ keyTick: st.keyTick + 1 }));
  }
  dsClearKey() {
    try { localStorage.removeItem(this.DS_KEY_LS); } catch (e) {}
    this.setState(st => ({ keyTick: st.keyTick + 1 }));
  }
  dsSetWorker() {
    const cur = this.dsWorkerUrl();
    const u = (window.prompt('Optional Cloudflare Worker proxy URL (leave blank for direct browser → DeepSeek). Example: https://xxx.workers.dev', cur) || '').trim();
    try { if (u) localStorage.setItem(this.DS_WORKER_LS, u); else localStorage.removeItem(this.DS_WORKER_LS); } catch (e) {}
    this.setState(st => ({ keyTick: st.keyTick + 1 }));
  }

  nowTime() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  onMissionInput(e) { this.setState({ missionInput: e.target.value }); }
  onMissionKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMission(); } }

  async sendMission() {
    const text = (this.state.missionInput || '').trim();
    if (!text || this.state.sending) return;

    const worker = this.dsWorkerUrl();
    // Direct browser→DeepSeek needs a key; a Worker proxy holds the key server-side.
    let key = '';
    if (!worker) { key = this.dsEnsureKey(); if (!key) return; }

    const userMsg = { who: 'you', text, time: this.nowTime() };
    const convo = [...this.state.liveMsgs, userMsg];
    this.setState({ liveMsgs: convo, missionInput: '', sending: true });

    // Build the OpenAI-compatible message list: meeting context + real transcript so far.
    const system = 'You are the ChatGPT Delegate (running on DeepSeek) in a live "Cooktop" meeting called "Atlas Launch Review". '
      + 'The current agenda item is the product pricing-page copy. You are one of several AI delegates addressing the room; '
      + 'the human (the Chairperson, initials JP) is speaking to you now. Reply concisely and conversationally, as a delegate would speak in a meeting — a few sentences, no markdown headings.';
    const apiMessages = [{ role: 'system', content: system }];
    for (const m of convo) {
      if (m.who === 'you') apiMessages.push({ role: 'user', content: m.text });
      else if (m.who === 'delegate') apiMessages.push({ role: 'assistant', content: m.text });
    }

    try {
      const endpoint = worker || 'https://api.deepseek.com/chat/completions';
      const headers = { 'Content-Type': 'application/json' };
      if (!worker) headers['Authorization'] = 'Bearer ' + key; // worker injects the key itself
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, stream: false }),
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 300); } catch (e) {}
        throw new Error('HTTP ' + res.status + (detail ? ' — ' + detail : ''));
      }
      const data = await res.json();
      const reply = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '(DeepSeek returned an empty reply)';
      this.setState(st => ({ liveMsgs: [...st.liveMsgs, { who: 'delegate', text: reply.trim(), time: this.nowTime() }], sending: false }));
    } catch (err) {
      const msg = (err && err.message) || String(err);
      const hint = /Failed to fetch|NetworkError|CORS/i.test(msg)
        ? 'Network/CORS blocked. If this persists, deploy the Cloudflare Worker proxy (see worker/README) and set its URL in Settings.'
        : '';
      this.setState(st => ({ liveMsgs: [...st.liveMsgs, { who: 'error', text: 'DeepSeek error: ' + msg + (hint ? '  ' + hint : ''), time: this.nowTime() }], sending: false }));
    }
  }
  // =================== end DeepSeek integration ===================

  isDark() { return this.state.dark ?? this.props.darkMode ?? false; }

  swipeStart(e) {
    const t = e.touches && e.touches[0];
    this._sw = t ? { x: t.clientX, y: t.clientY } : null;
  }
  swipeEnd(e, target) {
    const s = this._sw; this._sw = null;
    const t = e.changedTouches && e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y);
    if (s.x < 60 && dx > 70 && dy < 60) this.go(target);
  }

  syncBody() {
    document.body.style.background = this.isDark() ? '#131211' : '#F5F4F1';
  }
  componentDidMount() {
    this.syncBody();
    this._onDown = (e) => {
      let el = e.target;
      while (el && el !== document.body && !(el.style && el.style.cursor === 'pointer')) el = el.parentElement;
      if (!el || el === document.body) return;
      this._pressed = el;
      el.style.transition = 'transform .09s ease';
      el.style.transform = 'scale(0.965)';
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) {} }
    };
    this._onUp = () => {
      const el = this._pressed; this._pressed = null;
      if (!el) return;
      el.style.transition = 'transform .18s ease';
      el.style.transform = '';
      setTimeout(() => { if (el !== this._pressed) el.style.transition = ''; }, 220);
    };
    document.addEventListener('pointerdown', this._onDown, { passive: true });
    document.addEventListener('pointerup', this._onUp, { passive: true });
    document.addEventListener('pointercancel', this._onUp, { passive: true });
  }
  componentWillUnmount() {
    document.removeEventListener('pointerdown', this._onDown);
    document.removeEventListener('pointerup', this._onUp);
    document.removeEventListener('pointercancel', this._onUp);
  }
  componentDidUpdate() { this.syncBody(); }

  promptVals(th) {
    const prompts = [
      { title: 'Tone guide check', tag: 'Review', text: 'Review the attached copy against the Atlas tone guide: direct, no superlatives, no exclamation marks. List violations with suggested rewrites.', meta: 'Used 12× · works best with Claude' },
      { title: 'Competitor delta', tag: 'Research', text: 'Compare our pricing page against the latest competitor scan. Flag any claim a competitor has recently walked back.', meta: 'Used 7× · works best with ChatGPT' },
      { title: 'Mobile length pass', tag: 'Review', text: 'Check every headline and subhead for mobile wrapping: flag anything over 72 characters and propose a trim that keeps the meaning.', meta: 'Used 5× · works best with Gemini' },
      { title: 'Meeting recap', tag: 'Summary', text: 'Summarize this meeting into decisions, action items with owners, and open questions. Max 10 lines.', meta: 'Used 19× · runs via Secretary' },
    ].map((p, i) => ({ ...p,
      ring: i === this.state.promptIdx ? '#FF6B35' : th.line,
      tagFg: th.acfg, tagBg: th.acbg,
      onTap: () => this.setState({ promptIdx: i, ran: false }),
    }));
    return {
      prompts,
      draft: prompts[this.state.promptIdx] || prompts[0],
      ran: this.state.ran,
      runPrompt: () => this.setState({ ran: true }),
      runBg: this.state.ran ? '#0E7A61' : '#FF6B35',
      runFg: '#fff',
      runLabel: this.state.ran ? '✓ Queued' : 'Run test',
    };
  }

  pluginVals(th, s) {
    const conn = this.state.plugConn;
    const on = [th.gn[1], th.gn[0]], off = [th.sub, th.chip];
    const perm = (label, note, ok) => ({ label, note, mark: ok ? '✓' : '–', bg: ok ? th.gn[0] : th.chip, fg: ok ? th.gn[1] : th.faint });
    const base = [
      { key: 'C', initial: 'C', name: 'Claude', provider: 'Anthropic', bg: th.or[0], fg: th.or[1], delegateName: 'Claude Delegate' },
      { key: 'G', initial: 'G', name: 'ChatGPT', provider: 'OpenAI', bg: th.gn[0], fg: th.gn[1], delegateName: 'ChatGPT Delegate' },
      { key: 'Ge', initial: 'Ge', name: 'Gemini', provider: 'Google', bg: th.bl[0], fg: th.bl[1], delegateName: 'Gemini Delegate' },
      { key: 'CC', initial: 'CC', name: 'Claude Code', provider: 'Anthropic · CLI', bg: th.inv, fg: th.invtxt, delegateName: 'Claude Code Delegate' },
      { key: 'D', initial: 'D', name: 'Dispatch', provider: 'Cooktop Labs', bg: th.pu[0], fg: th.pu[1], delegateName: 'Dispatch Delegate' },
      { key: 'PC', initial: 'PC', name: 'Local PC Agent', provider: 'This device', bg: th.gray[0], fg: th.gray[1], delegateName: 'Local AI Delegate' },
      { key: 'MCP', initial: 'M', name: 'MCP Server', provider: 'Custom connector', bg: th.gray[0], fg: th.gray[1], delegateName: 'MCP Delegate' },
    ];
    const plugins = base.map((p, i) => {
      const isOn = !!conn[p.key];
      return { ...p,
        status: isOn ? 'Connected' : 'Off',
        stFg: isOn ? on[0] : off[0], stBg: isOn ? on[1] : off[1],
        onTap: () => this.setState({ screen: 'plugin', plugIdx: i }),
        perms: [
          perm('Join meetings when invited', 'Speaks only as ' + p.delegateName, isOn),
          perm('Submit deliverables', 'All work needs your approval', isOn),
          perm('Read task board', 'Assigned tasks only', isOn),
          perm('Access project files', 'Not granted', false),
        ],
      };
    });
    const plug = plugins[this.state.plugIdx] || plugins[0];
    const isOn = !!conn[plug.key];
    return {
      plugins, plug,
      plugConnectedCount: Object.values(conn).filter(Boolean).length,
      togglePlug: () => this.setState(st => ({ plugConn: { ...st.plugConn, [plug.key]: !st.plugConn[plug.key] } })),
      plugBtnBg: isOn ? th.dgr[0] : '#FF6B35',
      plugBtnFg: isOn ? th.dgr[1] : '#fff',
      plugBtnLabel: isOn ? 'Disconnect plugin' : 'Connect plugin',
    };
  }

  renderVals() {
    const s = this.state.screen;
    const dark = this.isDark();
    const accent = this.props.accent ?? '#FF6B35';

    // theme tokens
    const th = dark ? {
      bg: '#131211', card: '#1E1D1B', elev: '#26241F', txt: '#F2F1EF', sub: '#9C9994',
      faint: '#7A7772', line: 'rgba(255,255,255,0.09)', chip: '#2A2825',
      inv: '#F2F1EF', invtxt: '#131211', acbg: 'rgba(255,107,53,0.16)', acfg: '#FF8A5C',
      tabbg: 'rgba(19,18,17,0.85)',
      or: ['rgba(255,107,53,0.16)', '#FF8A5C'], gn: ['rgba(16,163,127,0.18)', '#3FBF9A'],
      bl: ['rgba(66,133,244,0.18)', '#7FA9F2'], pu: ['rgba(109,63,191,0.22)', '#B08FE8'],
      gray: ['#2A2825', '#C9C6C1'], dgr: ['rgba(192,57,43,0.2)', '#F08A7D'],
    } : {
      bg: '#F5F4F1', card: '#FFFFFF', elev: '#1C1B1A', txt: '#1C1B1A', sub: '#8A8783',
      faint: '#A8A5A0', line: 'rgba(0,0,0,0.06)', chip: '#EFEDE9',
      inv: '#1C1B1A', invtxt: '#FFFFFF', acbg: '#FDEEE6', acfg: '#B4531F',
      tabbg: 'rgba(245,244,241,0.88)',
      or: ['#FDEEE6', '#B4531F'], gn: ['#E7F5F0', '#0E7A61'],
      bl: ['#EAF1FE', '#2A63C9'], pu: ['#F3EDFC', '#6D3FBF'],
      gray: ['#EFEDE9', '#4A4845'], dgr: ['#FCEBE8', '#C0392B'],
    };
    th.faint = dark ? '#7A7772' : '#A8A5A0';

    const active = th.txt, idle = th.faint;
    const openTask = () => this.setState({ screen: 'taskDetail' });
    const openCol = (i) => () => this.setState({ screen: 'collectable', colIdx: i });

    const collectables = [
      { icon: 'Aa', typeShort: 'Copy doc', title: 'Pricing page copy — final', from: 'CT-114', initial: 'C', bg: th.or[0], fg: th.or[1],
        ref: 'CB-21', type: 'COPY DOCUMENT', origin: 'Made from CT-114', by: 'Claude Delegate', meta: 'Atlas Launch · today',
        heading: '"Pay for what you run. Nothing else."', body: 'Full pricing page copy: headline Option B, trimmed subhead (68 chars), three tier descriptions and FAQ answers. Approved by you.',
        provenance: 'Drafted in Atlas Launch Review · verified by ChatGPT against competitor scan · length flag by Gemini resolved in v3 · approved by Chairperson.' },
      { icon: '▦', typeShort: 'Report', title: 'Competitor pricing scan', from: 'CT-109', initial: 'G', bg: th.gn[0], fg: th.gn[1],
        ref: 'CB-20', type: 'RESEARCH REPORT', origin: 'Made from CT-109', by: 'ChatGPT Delegate', meta: 'Atlas Launch · 1 hr ago',
        heading: '9 competitors, 4 pricing models compared', body: 'Side-by-side matrix of per-seat vs usage pricing, discount ladders, and two recent "unlimited"-claim walk-backs flagged as risks.',
        provenance: 'Researched across 9 public sources · cited in Mission Room when selecting headline Option B.' },
      { icon: '✓', typeShort: 'Runbook', title: 'Launch-day runbook', from: 'CT-108', initial: 'C', bg: th.or[0], fg: th.or[1],
        ref: 'CB-19', type: 'RUNBOOK', origin: 'Made from CT-108', by: 'Claude Delegate', meta: 'Atlas Launch · 2 hr ago',
        heading: '14-step launch sequence with owners', body: 'Hour-by-hour launch checklist: status page, comms templates, rollback triggers, and delegate assignments for launch morning.',
        provenance: 'Drafted by Claude · reviewed and approved by Chairperson 2 hours ago.' },
      { icon: '</>', typeShort: 'Changelog', title: 'v2.4 changelog summary', from: 'CT-105', initial: 'G', bg: th.gn[0], fg: th.gn[1],
        ref: 'CB-18', type: 'CHANGELOG', origin: 'Made from CT-105', by: 'ChatGPT Delegate', meta: 'Atlas Launch · 3 hr ago',
        heading: '23 commits distilled to 6 user-facing notes', body: 'Public changelog copy for v2.4: new usage dashboard, faster export, two fixes. Written in product voice.',
        provenance: 'Generated from repo history via Claude Code · edited by ChatGPT · approved by Chairperson.' },
    ].map((c, i) => ({ ...c, onTap: openCol(i) }));

    // Live DeepSeek transcript rows, pre-styled so the template stays declarative.
    const liveMsgsView = this.state.liveMsgs.map((m) => ({
      ...m,
      isYou: m.who === 'you',
      isDelegate: m.who === 'delegate',
      isErr: m.who === 'error',
      initial: m.who === 'you' ? 'JP' : 'G',
      avBg: m.who === 'you' ? th.inv : th.gn[0],
      avFg: m.who === 'you' ? th.invtxt : th.gn[1],
    }));
    const dsKey = this.dsStoredKey();
    const dsWorker = this.dsWorkerUrl();

    return {
      // --- DeepSeek meeting bindings ---
      missionInput: this.state.missionInput,
      missionSending: this.state.sending,
      onMissionInput: (e) => this.onMissionInput(e),
      onMissionKey: (e) => this.onMissionKey(e),
      sendMission: () => this.sendMission(),
      liveMsgsView,
      dsKeySet: !!dsKey,
      dsKeyStatus: dsKey ? ('Key saved in this browser · ····' + dsKey.slice(-4)) : 'No key yet — you’ll be asked when you send',
      dsKeyBtn: dsKey ? 'Change key' : 'Set key',
      setDsKey: () => this.dsSetKey(),
      clearDsKey: () => this.dsClearKey(),
      dsWorkerSet: !!dsWorker,
      dsWorkerStatus: dsWorker ? dsWorker : 'Direct: browser → DeepSeek',
      setDsWorker: () => this.dsSetWorker(),

      isHome: s === 'home', isMission: s === 'mission', isTasks: s === 'tasks',
      isDelegates: s === 'delegates', isActivity: s === 'activity',
      isTaskDetail: s === 'taskDetail', isCollectable: s === 'collectable',
      isNewMeeting: s === 'newMeeting',
      goNewMeeting: () => this.go('newMeeting'),
      startMeeting: () => this.go('mission'),
      endMeeting: () => this.go('home'), // "End" was a dead control; return to Home safely
      swStart: (e) => this.swipeStart(e),
      swEndTask: (e) => this.swipeEnd(e, 'home'),
      swEndCol: (e) => this.swipeEnd(e, 'tasks'),
      swEndHome: (e) => this.swipeEnd(e, 'home'),
      swEndSettings: (e) => this.swipeEnd(e, 'settings'),
      isPromptLab: s === 'promptLab',
      goPromptLab: () => this.go('promptLab'),
      ...this.promptVals(th),
      isSettings: s === 'settings', isPlugin: s === 'plugin',
      goSettings: () => this.go('settings'),
      appearanceLabel: dark ? 'Dark' : 'Light',
      dkTrack: dark ? '#FF6B35' : (dark ? '#3A3835' : '#D5D2CD'),
      dkKnob: dark ? '18px' : '2px',
      ...this.pluginVals(th, s),
      goHome: () => this.go('home'), goMission: () => this.go('mission'),
      goTasks: () => this.go('tasks'), goDelegates: () => this.go('delegates'),
      goActivity: () => this.go('activity'),
      openTask, backFromTask: () => this.go('home'),
      approveTask: () => this.setState({ approved: true, reqSent: false, reqOpen: false }),
      approved: this.state.approved,
      openApprovedCollectable: openCol(0),
      approveBg: this.state.approved ? '#0E7A61' : th.inv,
      approveFg: this.state.approved ? '#fff' : th.invtxt,
      approveLabel: this.state.approved ? '✓ Approved' : 'Approve',
      taskBadge: this.state.reqSent ? 'CHANGES REQUESTED' : (this.state.approved ? 'APPROVED' : 'AWAITING APPROVAL'),
      taskBadgeFg: this.state.reqSent ? th.bl[1] : (this.state.approved ? th.gn[1] : th.acfg),
      taskBadgeBg: this.state.reqSent ? th.bl[0] : (this.state.approved ? th.gn[0] : th.acbg),
      reqOpen: this.state.reqOpen && !this.state.reqSent,
      reqSent: this.state.reqSent,
      openReq: () => this.setState({ reqOpen: true }),
      sendReq: () => this.setState({ reqOpen: false, reqSent: true, approved: false }),
      reqReason: ['tone', 'too long', 'factual issue', 'scope'][this.state.reqSel],
      reqChips: ['Tone', 'Too long', 'Factual issue', 'Scope'].map((label, i) => {
        const sel = i === this.state.reqSel;
        return { label,
          bg: sel ? th.acbg : th.chip, fg: sel ? th.acfg : th.sub,
          ring: sel ? '#FF6B35' : 'transparent',
          onTap: () => this.setState({ reqSel: i }),
        };
      }),

      dark, light: !dark,
      toggleDark: () => this.setState({ dark: !dark }),
      vBg: th.bg, vCard: th.card, vElev: th.elev, vTxt: th.txt, vSub: th.sub,
      vFaint: th.faint, vLine: th.line, vChip: th.chip, vInv: th.inv, vInvTxt: th.invtxt,
      vAcBg: th.acbg, vAcFg: th.acfg, vTabBg: th.tabbg,
      dangerBg: th.dgr[0], dangerFg: th.dgr[1],
      tintOrBg: th.or[0], tintOrFg: th.or[1], tintGnBg: th.gn[0], tintGnFg: th.gn[1],
      tintBlBg: th.bl[0], tintBlFg: th.bl[1],

      cHome: s === 'home' ? active : idle,
      cMission: s === 'mission' ? active : idle,
      cTasks: s === 'tasks' || s === 'taskDetail' || s === 'collectable' ? active : idle,
      cDelegates: s === 'delegates' ? active : idle,
      cActivity: s === 'activity' ? active : idle,

      agenda: [
        { n: 1, text: 'Review approved pricing copy in context' },
        { n: 2, text: 'Localization status — launch email' },
        { n: 3, text: 'Assign launch-morning monitoring' },
      ],
      meetCount: Object.values(this.state.meetSel).filter(Boolean).length,
      startLabel: 'Start meeting · ' + Object.values(this.state.meetSel).filter(Boolean).length + ' delegates + Secretary',
      meetDelegates: [
        { key: 'C', initial: 'C', name: 'Claude', desc: 'Writing & strategy', bg: th.or[0], fg: th.or[1] },
        { key: 'G', initial: 'G', name: 'ChatGPT', desc: 'Research & drafts', bg: th.gn[0], fg: th.gn[1] },
        { key: 'Ge', initial: 'Ge', name: 'Gemini', desc: 'Multimodal review', bg: th.bl[0], fg: th.bl[1] },
        { key: 'CC', initial: 'CC', name: 'Claude Code', desc: 'Code & tests', bg: th.inv, fg: th.invtxt },
        { key: 'D', initial: 'D', name: 'Dispatch', desc: 'Scheduling', bg: th.pu[0], fg: th.pu[1] },
        { key: 'PC', initial: 'PC', name: 'Local PC Agent', desc: 'Offline', bg: th.gray[0], fg: th.gray[1] },
      ].map((m) => {
        const sel = !!this.state.meetSel[m.key];
        return { ...m,
          ring: sel ? '#FF6B35' : th.line,
          check: sel ? '✓' : '',
          checkBg: sel ? '#FF6B35' : 'transparent',
          checkFg: '#fff',
          checkRing: sel ? '#FF6B35' : th.line,
          onTap: () => this.setState(st => ({ meetSel: { ...st.meetSel, [m.key]: !st.meetSel[m.key] } })),
        };
      }),

      collectables,
      collectableCount: collectables.length,
      col: collectables[this.state.colIdx] || collectables[0],

      burners: [
        { initial: 'C', name: 'Claude', status: 'Revising subhead', bg: th.or[0], fg: th.or[1], dot: accent, anim: 'ctPulse 1.6s infinite' },
        { initial: 'G', name: 'ChatGPT', status: 'Idle · in meeting', bg: th.gn[0], fg: th.gn[1], dot: '#0E7A61', anim: 'none' },
        { initial: 'Ge', name: 'Gemini', status: 'Idle · in meeting', bg: th.bl[0], fg: th.bl[1], dot: '#0E7A61', anim: 'none' },
        { initial: 'CC', name: 'Claude Code', status: 'Running test suite', bg: th.inv, fg: th.invtxt, dot: accent, anim: 'ctPulse 1.6s infinite' },
      ],

      taskGroups: [
        { label: 'NEEDS APPROVAL', count: 2, color: accent, tasks: [
          { id: 'CT-114', title: 'Pricing page copy — v3 draft', meta: 'Claude Delegate · 12 min ago', initial: 'C', bg: th.or[0], fg: th.or[1], onTap: openTask, hasCollectable: false },
          { id: 'CT-109', title: 'Competitor pricing scan', meta: 'ChatGPT Delegate · 1 hr ago', initial: 'G', bg: th.gn[0], fg: th.gn[1], onTap: openCol(1), hasCollectable: true },
        ]},
        { label: 'IN PROGRESS', count: 3, color: '#2A63C9', tasks: [
          { id: 'CT-117', title: 'Checkout flow test suite', meta: 'Claude Code Delegate · running 8 min', initial: 'CC', bg: th.inv, fg: th.invtxt, onTap: openTask, hasCollectable: false },
          { id: 'CT-115', title: 'Localize launch email (5 languages)', meta: 'Gemini Delegate · started 24 min ago', initial: 'Ge', bg: th.bl[0], fg: th.bl[1], onTap: openTask, hasCollectable: false },
          { id: 'CT-112', title: 'Press kit fact-check', meta: 'ChatGPT Delegate · started 1 hr ago', initial: 'G', bg: th.gn[0], fg: th.gn[1], onTap: openTask, hasCollectable: false },
        ]},
        { label: 'DONE TODAY', count: 4, color: '#0E7A61', tasks: [
          { id: 'CT-108', title: 'Launch-day runbook draft', meta: 'Approved · collectable saved', initial: 'C', bg: th.or[0], fg: th.or[1], onTap: openCol(2), hasCollectable: true },
          { id: 'CT-105', title: 'Changelog summary for v2.4', meta: 'Approved · collectable saved', initial: 'G', bg: th.gn[0], fg: th.gn[1], onTap: openCol(3), hasCollectable: true },
        ]},
      ],

      delegates: [
        { initial: 'C', name: 'Claude', desc: 'Writing, analysis, strategy', bg: th.or[0], fg: th.or[1], dot: '#0E7A61', action: 'Assign', actionColor: th.acfg, actionBg: th.acbg },
        { initial: 'G', name: 'ChatGPT', desc: 'Research, browsing, drafts', bg: th.gn[0], fg: th.gn[1], dot: '#0E7A61', action: 'Assign', actionColor: th.acfg, actionBg: th.acbg },
        { initial: 'Ge', name: 'Gemini', desc: 'Multimodal, long context', bg: th.bl[0], fg: th.bl[1], dot: '#0E7A61', action: 'Assign', actionColor: th.acfg, actionBg: th.acbg },
        { initial: 'CC', name: 'Claude Code', desc: 'Code, tests, deploys', bg: th.inv, fg: th.invtxt, dot: '#FF6B35', action: 'Busy', actionColor: th.sub, actionBg: th.chip },
        { initial: 'D', name: 'Dispatch', desc: 'Scheduling & handoffs', bg: th.pu[0], fg: th.pu[1], dot: '#0E7A61', action: 'Assign', actionColor: th.acfg, actionBg: th.acbg },
        { initial: 'PC', name: 'Local PC Agent', desc: 'Files & apps on your machine', bg: th.gray[0], fg: th.gray[1], dot: th.faint, action: 'Offline', actionColor: th.sub, actionBg: th.chip },
      ],

      activity: [
        { who: 'Claude Delegate', what: 'submitted Pricing page copy — v3 for approval', time: '12 min ago · Atlas Launch', dot: accent },
        { who: 'Secretary', what: 'logged action item: trim subhead to under 72 chars', time: '18 min ago · Mission Room', dot: th.sub },
        { who: 'Claude Code Delegate', what: 'started checkout flow test suite (142 tests)', time: '26 min ago · CT-117', dot: '#2A63C9' },
        { who: 'You', what: 'selected headline Option B in Atlas Launch Review', time: '31 min ago · Mission Room', dot: th.txt },
        { who: 'Gemini Delegate', what: 'flagged subhead length on pricing draft', time: '35 min ago · Mission Room', dot: '#2A63C9' },
        { who: 'ChatGPT Delegate', what: 'completed competitor pricing scan · 9 sources', time: '1 hr ago · CT-109', dot: '#0E7A61' },
        { who: 'Secretary', what: 'opened meeting: Atlas Launch Review, 5 agenda items', time: '1 hr ago · Mission Room', dot: th.sub },
      ],
    };
  }
}
