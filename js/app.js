/**
 * 求人パースHub - メインアプリケーションロジック
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- 定義・設定 ---
  const STORAGE_KEY_JOBS = 'kyujin_records_data';
  const STORAGE_KEY_COLUMNS = 'kyujin_export_columns';

  // フィールド定義
  const ALL_FIELDS = [
    { key: 'companyName', label: '会社名', defaultSelected: true, width: 140 },
    { key: 'jobTitle', label: '職種・ポジション', defaultSelected: true, width: 150 },
    { key: 'employmentType', label: '雇用形態', defaultSelected: true, width: 90 },
    { key: 'salary', label: '給与・想定年収', defaultSelected: true, width: 130 },
    { key: 'location', label: '勤務地', defaultSelected: true, width: 130 },
    { key: 'jobDescription', label: '仕事内容', defaultSelected: true, width: 160 },
    { key: 'requirements', label: '応募資格(必須)', defaultSelected: true, width: 160 },
    { key: 'preferred', label: '歓迎要件', defaultSelected: false, width: 140 },
    { key: 'workHours', label: '勤務時間', defaultSelected: false, width: 120 },
    { key: 'holidays', label: '休日・休暇', defaultSelected: true, width: 120 },
    { key: 'benefits', label: '福利厚生', defaultSelected: false, width: 140 },
    { key: 'selectionProcess', label: '選考フロー', defaultSelected: false, width: 130 },
    { key: 'sourceUrl', label: '求人URL/メモ', defaultSelected: true, width: 120 }
  ];

  // 状態
  let jobRecords = loadRecords();
  let selectedColumns = loadColumns();
  let editingId = null;

  // DOM要素
  const jobUrlInput = document.getElementById('jobUrlInput');
  const btnFetchUrl = document.getElementById('btnFetchUrl');
  const rawJobText = document.getElementById('rawJobText');
  const charCount = document.getElementById('charCount');
  const btnParseText = document.getElementById('btnParseText');
  const btnClearRaw = document.getElementById('btnClearRaw');
  const parsedDataForm = document.getElementById('parsedDataForm');
  const btnAddToList = document.getElementById('btnAddToList');
  const btnResetForm = document.getElementById('btnResetForm');
  const jobsTableBody = document.getElementById('jobsTableBody');
  const recordsCount = document.getElementById('recordsCount');
  const exportCountBadge = document.getElementById('exportCountBadge');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnClearAllRecords = document.getElementById('btnClearAllRecords');
  const tableFilterInput = document.getElementById('tableFilterInput');

  // AIモーダル関連
  const btnAiSettings = document.getElementById('btnAiSettings');
  const aiStatusBadge = document.getElementById('aiStatusBadge');
  const aiModal = document.getElementById('aiModal');
  const btnCloseAiModal = document.getElementById('btnCloseAiModal');
  const btnSaveAiSettings = document.getElementById('btnSaveAiSettings');
  const btnTestAi = document.getElementById('btnTestAi');
  const geminiApiKey = document.getElementById('geminiApiKey');
  const geminiModel = document.getElementById('geminiModel');
  const aiAutoParseCheck = document.getElementById('aiAutoParseCheck');

  // 列設定モーダル
  const btnColumnSettings = document.getElementById('btnColumnSettings');
  const colModal = document.getElementById('colModal');
  const btnCloseColModal = document.getElementById('btnCloseColModal');
  const columnCheckboxes = document.getElementById('columnCheckboxes');
  const btnSelectAllCols = document.getElementById('btnSelectAllCols');
  const btnSaveCols = document.getElementById('btnSaveCols');

  // フォームフィールド群のマップ
  const formInputs = {
    companyName: document.getElementById('f_companyName'),
    jobTitle: document.getElementById('f_jobTitle'),
    employmentType: document.getElementById('f_employmentType'),
    salary: document.getElementById('f_salary'),
    location: document.getElementById('f_location'),
    jobDescription: document.getElementById('f_jobDescription'),
    requirements: document.getElementById('f_requirements'),
    preferred: document.getElementById('f_preferred'),
    workHours: document.getElementById('f_workHours'),
    holidays: document.getElementById('f_holidays'),
    benefits: document.getElementById('f_benefits'),
    selectionProcess: document.getElementById('f_selectionProcess'),
    sourceUrl: document.getElementById('f_sourceUrl')
  };

  // --- 初期化 ---
  updateAiBadge();
  renderTable();
  renderColumnSettings();

  // 文字数カウント
  rawJobText.addEventListener('input', () => {
    charCount.textContent = rawJobText.value.length.toLocaleString();
  });

  // サンプルボタンのハンドラ
  document.querySelectorAll('.btn-chip[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sampleKey = btn.getAttribute('data-sample');
      if (window.SAMPLE_JOB_TEXTS && window.SAMPLE_JOB_TEXTS[sampleKey]) {
        rawJobText.value = window.SAMPLE_JOB_TEXTS[sampleKey];
        charCount.textContent = rawJobText.value.length.toLocaleString();
        showToast('サンプル求人を読み込みました', 'info');
        // 自動で解析実行
        executeParse();
      }
    });
  });

  // 生テキストのクリア
  btnClearRaw.addEventListener('click', () => {
    rawJobText.value = '';
    charCount.textContent = '0';
  });

  // URLから募集要項を取得して自動解析
  async function handleFetchUrl() {
    const url = jobUrlInput ? jobUrlInput.value.trim() : '';
    if (!url) {
      showToast('募集要項ページのURLを入力してください', 'warning');
      if (jobUrlInput) jobUrlInput.focus();
      return;
    }

    if (!window.jobUrlFetcher) {
      showToast('URL取得モジュールが読み込まれていません', 'warning');
      return;
    }

    const originalBtnHtml = btnFetchUrl.innerHTML;
    try {
      btnFetchUrl.disabled = true;
      btnFetchUrl.innerHTML = `<span>取得中...</span>`;
      showToast('URLから募集要項ページを取得しています...', 'info');

      const result = await window.jobUrlFetcher.fetchJobPage(url);
      rawJobText.value = result.text;
      charCount.textContent = rawJobText.value.length.toLocaleString();

      await executeParse(true);

      // 求人URL欄に取得元URLを自動セット
      if (formInputs.sourceUrl && (!formInputs.sourceUrl.value || !formInputs.sourceUrl.value.includes('http'))) {
        formInputs.sourceUrl.value = result.finalUrl || url;
      }
      showToast('URLから募集要項を読み込み、項目を抽出しました！', 'success');
    } catch (err) {
      console.warn('URL fetch error:', err);
      showToast(err.message || 'URLからの取得に失敗しました', 'warning');
    } finally {
      btnFetchUrl.disabled = false;
      btnFetchUrl.innerHTML = originalBtnHtml;
    }
  }

  if (btnFetchUrl) {
    btnFetchUrl.addEventListener('click', () => {
      handleFetchUrl();
    });
  }

  if (jobUrlInput) {
    jobUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFetchUrl();
      }
    });
  }

  // 解析ボタン押下
  btnParseText.addEventListener('click', () => {
    executeParse();
  });

  // 解析実行関数（AIとヒューリスティックのハイブリッド）
  async function executeParse(fromUrlFetch = false) {
    const text = rawJobText.value.trim();
    if (!text) {
      showToast('テキストが入力されていません', 'warning');
      rawJobText.focus();
      return;
    }

    // テキストエリアにURLだけが直接貼り付けられた場合は、自動的にURL取得ルートへ回す
    if (!fromUrlFetch && /^https?:\/\/\S+$/i.test(text)) {
      if (jobUrlInput) jobUrlInput.value = text;
      await handleFetchUrl();
      return;
    }

    // AIパーサーが有効かつ自動優先フラグがある場合
    if (window.geminiJobParser && window.geminiJobParser.isConfigured() && window.geminiJobParser.autoParse) {
      try {
        btnParseText.disabled = true;
        btnParseText.innerHTML = `<span>解析中 (Gemini AI)...</span>`;
        const aiResult = await window.geminiJobParser.parseWithAi(text);
        fillForm(aiResult);
        showToast('AIにより求人項目を高精度抽出しました！', 'success');
        return;
      } catch (err) {
        console.warn('AI parse failed, fallback to heuristic:', err);
        showToast(`AI解析失敗 (${err.message})。内蔵パーサーで解析します`, 'warning');
      } finally {
        btnParseText.disabled = false;
        btnParseText.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          項目を自動解析
        `;
      }
    }

    // 通常の内蔵ヒューリスティックパーサー（揺らぎ吸収ルール）
    const parsed = window.jobTextParser.parse(text);
    fillForm(parsed);
    showToast('内蔵ルールで揺らぎを吸収して項目を抽出しました', 'success');
  }

  // フォームに値をセット
  function fillForm(data) {
    for (const [key, input] of Object.entries(formInputs)) {
      if (input && data[key] !== undefined) {
        input.value = data[key] || '';
      }
    }
  }

  // フォームから値を取得
  function getFormData() {
    const data = {};
    for (const [key, input] of Object.entries(formInputs)) {
      data[key] = input ? input.value.trim() : '';
    }
    return data;
  }

  // フォームのリセット
  btnResetForm.addEventListener('click', () => {
    parsedDataForm.reset();
    editingId = null;
    btnAddToList.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      リストに追加
    `;
    showToast('フォームをクリアしました', 'info');
  });

  // リストに追加 / 更新
  btnAddToList.addEventListener('click', (e) => {
    e.preventDefault();
    const data = getFormData();

    if (!data.companyName && !data.jobTitle) {
      showToast('会社名または職種を入力してください', 'warning');
      formInputs.companyName.focus();
      return;
    }

    if (editingId) {
      // 既存データの更新
      const index = jobRecords.findIndex(r => r.id === editingId);
      if (index !== -1) {
        jobRecords[index] = { ...jobRecords[index], ...data, updatedAt: new Date().toISOString() };
        showToast(`「${data.companyName || '求人'}」のデータを更新しました`, 'success');
      }
      editingId = null;
      btnAddToList.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        リストに追加
      `;
    } else {
      // 新規追加
      const newRecord = {
        id: 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        ...data,
        createdAt: new Date().toISOString()
      };
      jobRecords.unshift(newRecord);
      showToast(`「${data.companyName || '求人'}」をリストに追加しました`, 'success');
    }

    saveRecords();
    renderTable();
    parsedDataForm.reset();
  });

  // スナイパーマッピングツール (テキスト選択クイック代入)
  document.querySelectorAll('.chip-assign').forEach(chip => {
    chip.addEventListener('click', () => {
      const targetField = chip.getAttribute('data-target');
      const input = formInputs[targetField];
      if (!input) return;

      const selStart = rawJobText.selectionStart;
      const selEnd = rawJobText.selectionEnd;
      const selectedText = rawJobText.value.substring(selStart, selEnd).trim();

      if (!selectedText) {
        showToast('左のテキストエリアで文字を選択してから押してください', 'warning');
        return;
      }

      input.value = selectedText;
      input.classList.add('flash-highlight');
      setTimeout(() => input.classList.remove('flash-highlight'), 600);
      showToast(`選択したテキストを「${ALL_FIELDS.find(f => f.key === targetField)?.label || targetField}」にセットしました`, 'info');
    });
  });

  // 検索フィルター
  tableFilterInput.addEventListener('input', () => {
    renderTable();
  });

  // テーブルの描画
  function renderTable() {
    const filter = tableFilterInput.value.toLowerCase().trim();
    let displayList = jobRecords;

    if (filter) {
      displayList = jobRecords.filter(r => {
        return (
          (r.companyName && r.companyName.toLowerCase().includes(filter)) ||
          (r.jobTitle && r.jobTitle.toLowerCase().includes(filter)) ||
          (r.location && r.location.toLowerCase().includes(filter)) ||
          (r.salary && r.salary.toLowerCase().includes(filter))
        );
      });
    }

    recordsCount.textContent = jobRecords.length;
    exportCountBadge.textContent = jobRecords.length;

    if (displayList.length === 0) {
      jobsTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="10">
            <div class="empty-state">
              <div class="empty-icon">${jobRecords.length === 0 ? '📂' : '🔍'}</div>
              <div class="empty-text">${jobRecords.length === 0 ? 'まだ登録された求人データがありません' : '該当する求人が見つかりません'}</div>
              <div class="empty-subtext">${jobRecords.length === 0 ? '求人テキストを貼り付けて「項目を自動解析」してください。' : '検索条件を変更してください。'}</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    displayList.forEach((r, idx) => {
      html += `
        <tr data-id="${r.id}">
          <td><strong>${idx + 1}</strong></td>
          <td><strong>${escapeHtml(r.companyName || '-')}</strong></td>
          <td>${escapeHtml(r.jobTitle || '-')}</td>
          <td><span class="badge-subtle">${escapeHtml(r.employmentType || '-')}</span></td>
          <td><span class="cell-truncate">${escapeHtml(r.salary || '-')}</span></td>
          <td><span class="cell-truncate">${escapeHtml(r.location || '-')}</span></td>
          <td><span class="cell-truncate" title="${escapeHtml(r.requirements || '')}">${escapeHtml(r.requirements || '-')}</span></td>
          <td><span class="cell-truncate" title="${escapeHtml(r.jobDescription || '')}">${escapeHtml(r.jobDescription || '-')}</span></td>
          <td><span class="cell-truncate">${escapeHtml(r.holidays || '-')}</span></td>
          <td>
            <div class="cell-actions">
              <button class="btn-icon btn-edit" title="編集" data-id="${r.id}">✏️</button>
              <button class="btn-icon btn-icon-danger btn-del" title="削除" data-id="${r.id}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    });

    jobsTableBody.innerHTML = html;

    // イベントバインド
    jobsTableBody.querySelectorAll('.btn-edit').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const target = jobRecords.find(r => r.id === id);
        if (target) {
          fillForm(target);
          editingId = id;
          btnAddToList.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            変更を保存
          `;
          showToast(`「${target.companyName}」を編集モードで開きました`, 'info');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    // 個別削除（1クリック即時削除）
    jobsTableBody.querySelectorAll('.btn-del').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.getAttribute('data-id');
        const targetIndex = jobRecords.findIndex(r => r.id === id);
        if (targetIndex === -1) return;

        const deletedRecord = jobRecords[targetIndex];
        jobRecords.splice(targetIndex, 1);
        saveRecords();
        renderTable();
        showToast(`「${deletedRecord.companyName || '求人'}」を削除しました`, 'info');
      });
    });
  }

  // 全件クリア（2段階確認）
  btnClearAllRecords.addEventListener('click', () => {
    if (jobRecords.length === 0) return;
    
    if (!btnClearAllRecords.classList.contains('confirming-clear')) {
      btnClearAllRecords.classList.add('confirming-clear');
      btnClearAllRecords.textContent = '本当に全件削除？';
      btnClearAllRecords.classList.add('btn-danger');
      btnClearAllRecords.classList.remove('btn-outline-danger');
      
      setTimeout(() => {
        btnClearAllRecords.classList.remove('confirming-clear');
        btnClearAllRecords.textContent = 'すべて削除';
        btnClearAllRecords.classList.remove('btn-danger');
        btnClearAllRecords.classList.add('btn-outline-danger');
      }, 4000);
      return;
    }

    jobRecords = [];
    saveRecords();
    renderTable();
    btnClearAllRecords.classList.remove('confirming-clear');
    btnClearAllRecords.textContent = 'すべて削除';
    btnClearAllRecords.classList.remove('btn-danger');
    btnClearAllRecords.classList.add('btn-outline-danger');
    showToast('すべての求人データを削除しました', 'info');
  });

  // --- CSVエクスポート処理 (Excel対応 UTF-8 BOM付き) ---
  btnExportCsv.addEventListener('click', () => {
    if (jobRecords.length === 0) {
      showToast('エクスポートする求人データがありません', 'warning');
      return;
    }

    const exportCols = ALL_FIELDS.filter(f => selectedColumns.includes(f.key));
    if (exportCols.length === 0) {
      showToast('出力するカラムが選択されていません', 'warning');
      return;
    }

    // CSVヘッダー行
    const headerRow = exportCols.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');

    // データ行
    const dataRows = jobRecords.map(record => {
      return exportCols.map(col => {
        const val = record[col.key] || '';
        // ダブルクォートのエスケープ処理
        return `"${val.replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = [headerRow, ...dataRows].join('\r\n');

    // UTF-8 BOM を付与してBlobを作成（Excel文字化け防止）
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

    // ダウンロードリンク発火
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.href = url;
    link.setAttribute('download', `求人票リスト_${nowStr}_${jobRecords.length}件.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`CSVファイル (${jobRecords.length}件) をダウンロードしました`, 'success');
  });

  // --- カラム設定モーダル ---
  btnColumnSettings.addEventListener('click', () => {
    renderColumnCheckboxes();
    colModal.classList.remove('hidden');
  });

  btnCloseColModal.addEventListener('click', () => {
    colModal.classList.add('hidden');
  });

  btnSelectAllCols.addEventListener('click', () => {
    columnCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  });

  btnSaveCols.addEventListener('click', () => {
    const checked = [];
    columnCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.checked) checked.push(cb.value);
    });

    if (checked.length === 0) {
      showToast('少なくとも1つの列を選択してください', 'warning');
      return;
    }

    selectedColumns = checked;
    localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(selectedColumns));
    colModal.classList.add('hidden');
    showToast('出力列の設定を保存しました', 'success');
  });

  function renderColumnSettings() {
    renderColumnCheckboxes();
  }

  function renderColumnCheckboxes() {
    let html = '';
    ALL_FIELDS.forEach(f => {
      const isChecked = selectedColumns.includes(f.key) ? 'checked' : '';
      html += `
        <label class="checkbox-label" style="padding: 4px 6px; border-radius: 4px; background: #f8fafc; border: 1px solid #e2e8f0;">
          <input type="checkbox" value="${f.key}" ${isChecked}>
          <span>${f.label}</span>
        </label>
      `;
    });
    columnCheckboxes.innerHTML = html;
  }

  // --- AIモーダル設定 ---
  btnAiSettings.addEventListener('click', () => {
    if (window.geminiJobParser) {
      geminiApiKey.value = window.geminiJobParser.apiKey;
      geminiModel.value = window.geminiJobParser.model;
      aiAutoParseCheck.checked = window.geminiJobParser.autoParse;
    }
    aiModal.classList.remove('hidden');
  });

  btnCloseAiModal.addEventListener('click', () => {
    aiModal.classList.add('hidden');
  });

  btnSaveAiSettings.addEventListener('click', () => {
    if (window.geminiJobParser) {
      window.geminiJobParser.saveConfig(
        geminiApiKey.value,
        geminiModel.value,
        aiAutoParseCheck.checked
      );
      updateAiBadge();
      aiModal.classList.add('hidden');
      showToast('AI設定を保存しました', 'success');
    }
  });

  btnTestAi.addEventListener('click', async () => {
    const key = geminiApiKey.value.trim();
    if (!key) {
      showToast('APIキーを入力してください', 'warning');
      return;
    }
    btnTestAi.disabled = true;
    btnTestAi.textContent = '接続中...';
    try {
      const workingModel = await window.geminiJobParser.testConnection(key, geminiModel.value);
      if (workingModel && geminiModel.value !== workingModel) {
        geminiModel.value = workingModel;
      }
      showToast(`Gemini API (${workingModel}) との接続テストに成功しました！`, 'success');
    } catch (e) {
      showToast(`接続失敗: ${e.message}`, 'warning');
    } finally {
      btnTestAi.disabled = false;
      btnTestAi.textContent = '接続テスト';
    }
  });

  function updateAiBadge() {
    if (window.geminiJobParser && window.geminiJobParser.isConfigured()) {
      aiStatusBadge.textContent = 'ON';
      aiStatusBadge.className = 'ai-status-on';
    } else {
      aiStatusBadge.textContent = 'OFF';
      aiStatusBadge.className = 'ai-status-off';
    }
  }

  // --- 永続化 (LocalStorage) ---
  function loadRecords() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_JOBS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY_JOBS, JSON.stringify(jobRecords));
  }

  function loadColumns() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_COLUMNS);
      return data ? JSON.parse(data) : ALL_FIELDS.filter(f => f.defaultSelected).map(f => f.key);
    } catch (e) {
      return ALL_FIELDS.filter(f => f.defaultSelected).map(f => f.key);
    }
  }

  // --- トースト通知 ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
