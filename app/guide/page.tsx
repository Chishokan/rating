import Link from "next/link";

export const metadata = {
  title: "使い方 | 通知表 評定集計",
};

export default function GuidePage() {
  return (
    <div>
      <h1>使い方</h1>
      <p className="subtitle">
        通知表の写真・PDFから評定を読み取り、校舎ごとに集計します。
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>基本の流れ</h2>
        <ol style={{ paddingLeft: "1.2em", lineHeight: 1.9 }}>
          <li>
            <strong>校舎を選ぶ</strong>
            <br />
            <span className="muted">
              「撮影・登録」タブで、駅前校 / 日宇校 / 大野校 / 日野校 から選択します。
            </span>
          </li>
          <li>
            <strong>通知表の画像・PDFを選ぶ（複数まとめて可）</strong>
            <br />
            <span className="muted">
              スマホなら「カメラで撮影」または「既存の写真・ファイルを選択」。
              複数ページのPDFは自動で1ページずつに分割し、各ページを1通知表として扱います。
            </span>
          </li>
          <li>
            <strong>「すべて解析」を押す</strong>
            <br />
            <span className="muted">
              AIが各ファイルから10科目の評定を読み取ります（最大4件を並列で高速処理）。
            </span>
          </li>
          <li>
            <strong>読み取り結果を確認・修正する</strong>
            <br />
            <span className="muted">
              氏名・学年・学期・各科目の評定をその場で編集できます。読み取れなかった科目は空欄のままでOK。
            </span>
          </li>
          <li>
            <strong>「保存」する</strong>
            <br />
            <span className="muted">
              解析済みの全件を選択中の校舎で保存します。Googleスプレッドシートに評定が記録され、元ファイル（画像・PDF）は指定のDriveフォルダに保存されます。
            </span>
          </li>
        </ol>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>10科目について</h2>
        <p>
          評定は次の10科目の固定枠に振り分けられます（表記ゆれは自動でまとめます）。
        </p>
        <table>
          <thead>
            <tr>
              <th>集計上の科目</th>
              <th>通知表での表記例</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>英語</td>
              <td>外国語 / 外国語（英語）</td>
            </tr>
            <tr>
              <td>社会</td>
              <td>地理 / 歴史 / 公民</td>
            </tr>
            <tr>
              <td>美術</td>
              <td>図画工作 / 図工</td>
            </tr>
            <tr>
              <td>保体</td>
              <td>保健体育 / 体育 / 保健</td>
            </tr>
            <tr>
              <td>技術・家庭科</td>
              <td>技術・家庭（技術分野→技術、家庭分野→家庭科）</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>ヒントと注意点</h2>
        <ul style={{ paddingLeft: "1.2em", lineHeight: 1.9 }}>
          <li>
            <strong>読み取りはAIの推定です。</strong>
            保存前に必ず内容を確認してください。
          </li>
          <li>
            <strong>PDFは1ページ3MBまで。</strong>
            大きい場合は解像度を下げるか分割してください（複数ページPDFは自動分割されます）。
          </li>
          <li>
            <strong>きれいに撮るコツ:</strong>
            明るい場所で、評定の表全体がまっすぐ・ピントが合うように撮影すると精度が上がります。
          </li>
          <li>
            <strong>保存先:</strong>
            保存すると、評定データはGoogleスプレッドシートに、元ファイルは指定のDriveフォルダに保存されます。
            自分がアップロードした分だけを扱い、他の人のデータは画面に表示されません。
          </li>
          <li>
            <strong>エラーが出たら:</strong>
            そのファイルだけ「再解析」または「削除」できます。うまくいったものだけ保存できます。
          </li>
        </ul>
      </div>

      <div className="btn-row">
        <Link className="btn" href="/">
          撮影・登録を始める
        </Link>
      </div>
    </div>
  );
}
