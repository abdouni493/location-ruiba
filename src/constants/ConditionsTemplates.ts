/**
 * Conditions Templates - Arabic and French
 * Used for printing rental conditions without database connection
 * Language: Both Arabic (RTL) and French (LTR)
 */

import { formatDateDMY } from '../utils/dateFormat';

export interface ConditionItem {
  title: string;
  content: string;
}

export interface ConditionsTemplate {
  language: 'ar' | 'fr';
  title: string;
  subtitle: string;
  conditions: ConditionItem[];
  clientSignatureLabel: string;
  agencySignatureLabel: string;
}

/**
 * ARABIC CONDITIONS TEMPLATE
 * Complete rental agreement conditions in Arabic
 */
export const ARABIC_CONDITIONS_TEMPLATE: ConditionsTemplate = {
  language: 'ar',
  title: 'شروط الإيجار',
  subtitle: 'يمكنك قراءة شروط العقد في الأسفل ومصادقة عليها',
  conditions: [
    {
      title: 'السن',
      content: 'يجب أن يكون السائق يبلغ من العمر 20 عامًا على الأقل، وأن يكون حاصلًا على رخصة قيادة منذ سنتين على الأقل'
    },
    {
      title: 'جواز السفر',
      content: 'إيداع جواز السفر البيومتري إلزامي، بالإضافة إلى دفع تأمين ابتدائي حسب فئة المركبة، ويُعدّ هذا بمثابة ضمان تطلبه'
    },
    {
      title: 'الوقود',
      content: 'الوقود يكون على نفقة الزبون'
    },
    {
      title: 'قانون ونظام',
      content: 'يتم الدفع نقدًا عند تسليم السيارة'
    },
    {
      title: 'النظافة',
      content: 'تسلم السيارة نظيفة ويجب إرجاعها في نفس الحالة، وفي حال عدم ذلك، سيتم احتساب تكلفة الغسيل بمبلغ 1000 دج'
    },
    {
      title: 'مكان التسليم',
      content: 'يتم تسليم السيارات في موقف السيارات التابع لوكالاتنا'
    },
    {
      title: 'جدول المواعيد',
      content: 'يجب على الزبون احترام المواعيد المحددة عند الحجز. يجب الإبلاغ مسبقًا عن أي تغيير. لا يمكن للزبون تمديد مدة الإيجار إلا بعد الحصول على إذن من وكالتنا للإيجار، وذلك بإشعار مسبق لا يقل عن 24 ساعة'
    },
    {
      title: 'الأضرار والخسائر',
      content: 'في حالة السرقة أو تضرر المركبة، يجب تقديم تصريح لدى مصالح الشرطة أو الدرك الوطني. قبل أي تصريح، يجب على الزبون إبلاغ وكالة الكراء بشكل إلزامي'
    },
    {
      title: 'الحادث',
      content: 'يتحمل الزبون كل نفقات السيارة في حال حادث أو ضرر بالسيارة من الداخل والخارج'
    },
    {
      title: 'تأمين',
      content: 'يستفيد من التأمين فقط السائقون المذكورون في عقد الكراء. يُمنع منعًا باتًّا إعارة أو تأجير المركبة من الباطن. وتكون جميع الأضرار الناتجة عن مثل هذه الحالات على عاتق الزبون بالكامل'
    },
    {
      title: 'عطل ميكانيكي',
      content: 'خلال فترة الإيجار، وبناء على عدد الكيلومترات المقطوعة، يجب على الزبون إجراء الفحوصات اللازمة مثل مستوى الزيت، حالة المحرك، ضغط الإطارات، وغيرها. في حال حدوث عطل ميكانيكي بسبب إهمال الزبون في إجراء هذه الفحوصات أو لأي سبب آخر ناتج عن مسؤولية الزبون (مثلاً: كسر حوض الزيت، العارضة السفلية، القفل أو غيرها)، فإن تكاليف الإصلاح والصيانة تكون على عاتق الزبون بالكامل'
    },
    {
      title: 'خسائر إضافية',
      content: 'الأضرار التي تلحق بالعجلات والإطارات، القيادة بالإطارات المفرغة من الهواء، التدهور، السرقة، نهب الملحقات، أعمال التخريب، الأضرار الميكانيكية الناتجة عن سوء استخدام المركبة، المخالفات المرورية، الأضرار التي تحدث أسفل المركبة (الصدام الأمامي، الجوانب، حوض الزيت، العادم) والأضرار الناتجة عن الاضطرابات والشغب، كلها سيتم تحميل تكلفتها على الزبون'
    },
    {
      title: 'ضريبة التأخر',
      content: 'مدة الإيجار تُحتسب على فترات كاملة مدتها 24 ساعة غير قابلة للتقسيم، ابتداءً من وقت حجز المركبة وحتى الوقت المذكور في العقد. يجب على الزبون إعادة المركبة في نفس الوقت، وإلا سيتم احتساب تكلفة تأخير مقدارها 800 دينار لكل ساعة تأخير'
    },
    {
      title: 'عدد الأميال',
      content: 'عدد الكيلومترات محدود لجميع مركباتنا بـ 300 كم يوميًا على حسب نوع السيارة، ويُفرض غرامة قدرها 30 دج عن كل كيلومتر زائد'
    },
    {
      title: 'شروط',
      content: 'يُقرّ الزبون بأنه اطّلع على شروط الإيجار هذه وقبلها دون أي تحفظ، ويتعهد بتوقيع هذا العقد'
    },
    {
      title: 'المسؤولية القانونية',
      content: 'في حالة ضبط السيارة بأي شكل من جميع الممنوعات أو أي شيء مخالف للقانون، يتحمل الزبون كل المسؤوليات القانونية لدى مصالح الدرك أو الشرطة أو المحكمة بصفة عامة'
    },
    {
      title: 'المصاريف والمتابعة',
      content: 'كل المصاريف على عاتق الزبون، وإذا لم يتم دفع مستحقات الوكالة فللوكالة الحق في متابعة الزبون قضائيًا'
    }
  ],
  clientSignatureLabel: 'امضاء وبصمة الزبون',
  agencySignatureLabel: 'امضاء صاحب وكالة'
};

/**
 * FRENCH CONDITIONS TEMPLATE
 * Complete rental agreement conditions in French
 */
export const FRENCH_CONDITIONS_TEMPLATE: ConditionsTemplate = {
  language: 'fr',
  title: 'Les Conditions Générales de location véhicule',
  subtitle: 'Vous pouvez lire les conditions de location, elles apparaîtront sur le contra de location',
  conditions: [
    {
      title: 'Age',
      content: 'Le conducteur doit être âgé au minimum de 20 ans et être titulaire d\'un permis de conduire d\'au moins 2 ans.'
    },
    {
      title: 'Passeport',
      content: 'Dépôt obligatoire du passeport biométrique et une caution selon la catégorie du véhicule, qui constitue une garantie que nous demandons.'
    },
    {
      title: 'Carburant',
      content: 'Le carburant est à la charge du client.'
    },
    {
      title: 'Règlement',
      content: 'Le paiement se fait à la livraison de la voiture en espèces.'
    },
    {
      title: 'Propreté',
      content: 'Le véhicule est livré propre et doit être restitué dans le même état, faute de quoi le lavage sera facturé au prix de 1000 Da.'
    },
    {
      title: 'Lieux de livraisons',
      content: 'La livraison des voitures s\'effectue sur le parking de nos agences.'
    },
    {
      title: 'Horaire',
      content: 'Le client doit respecter les horaires établit à la réservation. Tout changement doit être signalé à l\'avance. Le client ne peut prolonger sa location que sur autorisation de notre agence location avec un préavis de 24 heures.'
    },
    {
      title: 'Cas de sinistre',
      content: 'Assurance de base : Le client s\'engage à payer tout dégât occasionné sur le véhicule qu\'il soit fautif ou non fautif. Toutes dégats sur le véhicule feras l\'objet d\'un ponctionnement sur la contion de garantie'
    },
    {
      title: 'Accident',
      content: 'Le client prend en charge tous les frais du véhicule en cas d\'accident ou de dommage au véhicule, à l\'intérieur comme à l\'extérieur.'
    },
    {
      title: 'Assurances',
      content: 'Seuls les conducteurs mentionnés sur le contrat de location bénéficient de l\'assurance. Le prêt et la sous-location du véhicule sont strictement interdits. L\'intégralité des dommages survenus dans ces circonstances est à la charge du client.'
    },
    {
      title: 'Panne mécanique',
      content: 'Au cours de la location en fonction du kilométrage parcourus le client doit effectuer les contrôles d\'usage (niveau d\'huile, moteur, pression des pneus, etc....). En cas de panne mécanique due à la négligence du client pour ne pas avoir effectué les contrôles d\'usage ou pour tout autre raisons due à la responsabilité du client (ex: casse carter d\'huile, triangle inférieur, serrure ou autres etc.), la prise en charge du dépannage et de la réparation sont à la charge totale du client.'
    },
    {
      title: 'Dégâts supplémentaire',
      content: 'Les dégâts aux jantes et pneumatiques, le roulage à plat des pneumatiques, la détérioration, les vols, les pillages d\'accessoires, les actes de vandalisme, les dégâts mécaniques dus à une mauvaise utilisation du véhicule, les procès verbaux, les dégâts survenus en dessous du véhicule (jupe, bas de caisse, carter d\'huile, échappement) et les dommages causés par les troubles et émeutes seront facturés au client.'
    },
    {
      title: 'Pénalité de retard',
      content: 'La durée de location se calcul par tranche de 24 heure non fractionnable depuis l\'heure de la réservation du véhicule et l\'heure mentionnée sur le contrat. Le client doit restituer le véhicule à la même heure autrement chaque heure de retard sera facturée au prix de 800 dinars/heure.'
    },
    {
      title: 'Kilométrage',
      content: 'Le kilométrage est limité pour tous nos véhicules a 300Km/Jour, selon le type de véhicule.'
    },
    {
      title: 'Acceptation',
      content: 'Le client déclare avoir pris connaissance et accepter sans réserve les présentes conditions de location.et s engage a signé ce contrat.'
    },
    {
      title: 'Responsabilité légale',
      content: 'En cas de constatation d\'objets interdits ou de toute chose contraire à la loi dans le véhicule, le client assume l\'entière responsabilité légale devant les services de la gendarmerie, de la police ou du tribunal, de manière générale.'
    },
    {
      title: 'Frais et poursuites',
      content: 'Tous les frais sont à la charge du client. À défaut de paiement des sommes dues à l\'agence, celle-ci se réserve le droit de poursuivre le client en justice.'
    }
  ],
  clientSignatureLabel: 'Signature et empreinte du client',
  agencySignatureLabel: 'Signature et scellés de l\'Agence'
};

/**
 * Get conditions template by language
 */
export const getConditionsTemplate = (language: 'ar' | 'fr'): ConditionsTemplate => {
  return language === 'ar' ? ARABIC_CONDITIONS_TEMPLATE : FRENCH_CONDITIONS_TEMPLATE;
};

/**
 * Generate HTML content for printing conditions.
 * Layout summary:
 *   - Blue gradient header  : linear-gradient(135deg, #003399 → #0047b2)
 *   - Condition font        : 12.5px / 600 (bold #003399 prefix)
 *   - Row divider           : 1px solid #eef0f7
 *   - Acceptance box        : bg #f0f4ff, border #b8ccee
 *   - Signatures            : simple empty rectangles with the label below
 *   - Page border           : 2px solid #003399
 *
 * SINGLE-PAGE GUARANTEE — three independent layers, because a stray blank second
 * sheet was being printed in both languages:
 *   1. The sheet is sized in millimetres, never in pixels. A4 is 210 × 297mm which is
 *      793.7 × 1122.52 CSS px, so the previous `width: 794px / min-height: 1123px`
 *      overflowed the page box by a fraction of a pixel and always spilled onto a
 *      second (blank) page — even when the content itself fitted.
 *   2. Both languages are rendered at a reduced typographic scale (Arabic was
 *      previously unscaled and genuinely overflowed; French was already scaled but
 *      not enough), so the 17 conditions + acceptance box + signatures + footer fit
 *      with room to spare.
 *   3. `fitToPage()` runs in the print window and shrinks `--s` further if the real
 *      text metrics still exceed the sheet, so the output survives font substitution.
 */

/** Usable sheet height in mm — a hair under A4 so sub-pixel rounding cannot spill. */
const SHEET_HEIGHT_MM = 296.5;

export const generateConditionsPrintHTML = (language: 'ar' | 'fr'): string => {
  const template = getConditionsTemplate(language);
  const isArabic = language === 'ar';
  const dir = isArabic ? 'rtl' : 'ltr';
  const textAlign = isArabic ? 'right' : 'left';

  /**
   * Per-language base scale (fonts + vertical rhythm). French wording is considerably
   * longer than the Arabic one, so it renders smaller. Horizontal gutters stay fixed so
   * both languages keep the same page frame. Measured against Chrome/Arial these leave
   * ~110px (≈10%) of vertical headroom on the 1122.5px sheet, which absorbs the line-wrap
   * differences caused by font substitution on other machines.
   */
  const scale = isArabic ? 0.97 : 0.85;

  /**
   * Every vertical dimension is emitted as `calc(<base>px * var(--s))` so `fitToPage()`
   * can rescale the whole sheet by touching a single custom property.
   */
  const u = (n: number): string => `calc(${Math.round(n * scale * 100) / 100}px * var(--s))`;

  const conditionsHTML = template.conditions
    .map(
      (condition, index) => `
      <div class="condition-item">
        <p class="condition-text">
          <span class="condition-title">${index + 1}- ${condition.title} </span>${condition.content}
        </p>
      </div>`
    )
    .join('');

  const acceptanceText = isArabic
    ? 'قام المستأجر بالاطلاع على شروط الإيجار هذه وقبلها دون أي تحفظ، ويتعهد بتوقيع هذا العقد وتحمّل جميع المسؤوليات الثانوية.'
    : "Le locataire déclare avoir pris connaissance des présentes conditions de location et les accepter sans réserve, s'engage à signer ce contrat et à assumer toutes les responsabilités secondaires.";

  const printDate = formatDateDMY(new Date());

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="utf-8">
  <title>${template.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    /* Global typographic scale, narrowed by fitToPage() when the sheet overflows. */
    :root { --s: 1; }

    /* Height/overflow are pinned in @media print only, so the on-screen preview
       iframe can still be scrolled through the whole sheet. */
    html, body {
      width: 210mm;
      margin: 0;
      padding: 0;
      background: white;
    }

    body {
      font-family: 'Arial', 'Helvetica Neue', sans-serif;
      color: #222;
      direction: ${dir};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── PAGE ──
       Exactly one sheet: fixed A4-minus-a-hair height with the overflow clipped, so
       nothing can ever generate a second page. Block layout (not flex) so children
       keep their natural height and .scrollHeight reports the true content size. */
    .page {
      width: 210mm;
      height: ${SHEET_HEIGHT_MM}mm;
      overflow: hidden;
      padding-bottom: ${u(26)};
      background: white;
      border: 2px solid #003399;
    }

    /* ── HEADER ── */
    .header {
      background: linear-gradient(135deg, #003399 0%, #0047b2 100%);
      color: white;
      padding: ${u(18)} 47px ${u(15)};
      text-align: center;
    }

    .header h1 {
      font-size: ${u(22)};
      font-weight: 800;
      margin: 0 0 ${u(7)};
      letter-spacing: 0.3px;
    }

    .header p {
      font-size: ${u(12.5)};
      margin: 0;
      opacity: 0.88;
      font-style: italic;
      color: rgba(255,255,255,0.88);
    }

    /* ── CONTENT ──
       The content takes only the height it needs so the acceptance box +
       signatures sit directly beneath the conditions instead of being pushed
       to the bottom of the A4 page. */
    .content {
      padding: ${u(13)} 47px 0;
    }

    /* ── CONDITION ROWS ── */
    .condition-item {
      padding: ${u(6)} 0;
      border-bottom: 1px solid #eef0f7;
    }
    .condition-item:last-child { border-bottom: none; }

    .condition-text {
      font-size: ${u(12.5)};
      color: #111;
      font-weight: 600;
      line-height: 1.55;
      margin: 0;
      text-align: ${textAlign};
    }

    .condition-title {
      font-weight: 800;
      color: #003399;
    }

    /* ── ACCEPTANCE ── */
    .acceptance {
      margin: ${u(12)} 47px 0;
      padding: ${u(9)} ${u(12)};
      background: #f0f4ff;
      border-radius: 5px;
      border: 1px solid #b8ccee;
      font-size: ${u(12.5)};
      color: #003399;
      font-weight: 700;
      text-align: ${textAlign};
    }

    /* ── SIGNATURES: simple empty rectangles ── */
    .signatures-section {
      margin: ${u(14)} 47px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 27px;
    }

    .signature-block { text-align: center; }

    .signature-box {
      border: 2px solid #003399;
      border-radius: 4px;
      height: ${u(92)};
      background: #fff;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: ${u(8)};
    }

    .signature-label {
      font-size: ${u(12.5)};
      font-weight: 700;
      color: #003399;
      letter-spacing: 0.2px;
    }

    .print-date {
      text-align: center;
      font-size: ${u(9)};
      color: #888;
      margin: ${u(11)} 47px 0;
      padding-top: ${u(9)};
      border-top: 1px solid #dde3f5;
    }

    @media print {
      @page { size: A4; margin: 0; }
      html, body {
        width: 210mm;
        height: ${SHEET_HEIGHT_MM}mm;
        overflow: hidden;
      }
      /* Nothing may introduce a page break: this document is one sheet, period. */
      .page { page-break-after: avoid; page-break-inside: avoid; break-inside: avoid; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="page" id="page">

    <div class="header">
      <h1>${template.title}</h1>
      <p>${template.subtitle}</p>
    </div>

    <div class="content">
      ${conditionsHTML}
    </div>

    <div class="acceptance">
      ${acceptanceText}
    </div>

    <div class="signatures-section">
      <div class="signature-block">
        <div class="signature-box">
          <div class="signature-label">${template.agencySignatureLabel}</div>
        </div>
      </div>
      <div class="signature-block">
        <div class="signature-box">
          <div class="signature-label">${template.clientSignatureLabel}</div>
        </div>
      </div>
    </div>

    <div class="print-date">
      ${isArabic ? 'التاريخ: ' : 'Date: '}${printDate}
    </div>

  </div>

  <script>
    /**
     * Last line of defence against a second sheet: the base scale above is tuned to fit,
     * but real text metrics depend on the installed fonts. If the content is still taller
     * than the sheet, shrink the global scale until it fits (the page clips its overflow,
     * so an unfitted sheet would silently lose the signatures rather than paginate).
     * Runs synchronously at parse time — the document has no images or webfonts, so the
     * measurement is already final when print() is called right after document.close().
     */
    (function fitToPage() {
      var page = document.getElementById('page');
      if (!page) return;
      var root = document.documentElement;
      var s = 1;
      // 0.02 steps down to 0.6 => at most 20 reflows, all on a single static page.
      while (page.scrollHeight > page.clientHeight && s > 0.6) {
        s = Math.round((s - 0.02) * 100) / 100;
        root.style.setProperty('--s', String(s));
      }
    })();
  </script>
</body>
</html>`;
};
