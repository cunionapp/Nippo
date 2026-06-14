/**
 * gas-client-bridge.js
 * GitHub Pages やローカル環境から GAS Web App に通信するための RPC ブリッジ
 */
(function () {
  // GASサーバー環境下（NodeやGAS実行環境）では実行しないようガード
  if (typeof window === 'undefined') {
    return;
  }

  // すでに GAS 側の google.script.run が存在する場合は、何もしない（GAS環境互換性維持のため）
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    console.log("GAS環境を検出したため、ネイティブの google.script.run を使用します。");
    return;
  }

  // ==========================================
  // 【重要】ユーザー設定項目
  // GAS上でデプロイしたそれぞれのWebアプリURLを設定してください。
  // ==========================================
  // デプロイ①（API用 / 実行ユーザー: 自分、アクセス権: 全員）のURL
  const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyb2zGD6bxSF-WMSSQdV37vbw9vusJ_SCWDCawgd9ayOZ74bi02fKyvWlnMfn8Jhu88Xg/exec";

  // デプロイ②（認証用 / 実行ユーザー: アクセス者、アクセス権: 全員）のURL
  const GAS_AUTH_URL = "https://script.google.com/macros/s/AKfycbwJhV-JQe9VHJVyiShYMAetzOwu_bSvwcHiLcSh6M-SVQ_Dpu0mb4QC3i-Zho17uyKKNw/exec";
  // ==========================================

  window.google = window.google || {};
  window.google.script = window.google.script || {};

  window.google.script.run = {
    withSuccessHandler: function (successCallback) {
      return {
        withFailureHandler: function (failureCallback) {
          // Proxyを使用して、呼び出された関数名をインターセプトしてAPI呼び出しに変換
          return new Proxy({}, {
            get(target, methodName) {
              return function (...args) {
                const token = localStorage.getItem("gas_session_token");

                // トークンが無い場合はログイン処理にリダイレクト
                if (!token) {
                  console.warn("セッショントークンが見つかりません。ログイン処理を開始します。");
                  handleAuthRequired();
                  return;
                }

                // リクエストペイロード
                const payload = {
                  action: "rpc",
                  method: methodName,
                  args: args,
                  token: token
                };

                // fetch で POST 通信を実行
                fetch(GAS_API_URL, {
                  method: "POST",
                  mode: "cors",
                  headers: {
                    "Content-Type": "text/plain; charset=utf-8"
                  },
                  body: JSON.stringify(payload)
                })
                  .then(response => {
                    if (!response.ok) {
                      throw new Error("HTTPエラー ステータス: " + response.status);
                    }
                    return response.json();
                  })
                  .then(data => {
                    if (data.error) {
                      if (data.authError) {
                        console.warn("セッショントークンが無効または期限切れです。再認証します。");
                        handleAuthRequired();
                      } else {
                        failureCallback(new Error(data.message));
                      }
                    } else {
                      successCallback(data.result);
                    }
                  })
                  .catch(err => {
                    console.error("API呼び出し失敗:", err);
                    failureCallback(err);
                  });
              };
            }
          });
        }
      };
    }
  };

  // 認証が必要な場合のリダイレクト処理
  function handleAuthRequired() {
    localStorage.removeItem("gas_session_token");
    const currentUrl = window.location.href.split('?')[0];
    window.location.href = `${GAS_AUTH_URL}?action=login&redirect=${encodeURIComponent(currentUrl)}`;
  }

  // 起動時にURLパラメータからトークンを回収して保存する
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    localStorage.setItem("gas_session_token", token);
    // URLから token パラメータを消去して履歴を置換
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  }
})();
