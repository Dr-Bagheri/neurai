import { Boxes, Cpu, Database, Radar, ShieldCheck, Workflow } from 'lucide-react'

import { FloatingStat } from '@/components/sections/FloatingStat'
import { Hero } from '@/components/sections/Hero'
import { Section } from '@/components/sections/Section'
import { ButtonLink } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'

const CAPABILITIES = [
  {
    icon: Cpu,
    title: 'مدل‌های زبانی خودمیزبان',
    body: 'استقرار مدل‌های متن‌باز روی زیرساخت شما — بدون وابستگی به سرویس‌های خارجی، بدون هزینهٔ توکن، با کنترل کامل روی داده.',
  },
  {
    icon: Database,
    title: 'بازیابی مبتنی بر دانش',
    body: 'اتصال مدل به داده‌های واقعی سازمان با جست‌وجوی برداری فارسی، تا پاسخ‌ها مستند و قابل ارجاع باشند نه ساختگی.',
  },
  {
    icon: Workflow,
    title: 'عامل‌های خودکار',
    body: 'طراحی جریان‌های کاری که تصمیم می‌گیرند، ابزار صدا می‌زنند و کار را تا انتها می‌برند — با نظارت انسانی در نقاط حساس.',
  },
  {
    icon: Radar,
    title: 'ارزیابی و پایش',
    body: 'سنجهٔ کیفیت برای زبان فارسی، پایش بلادرنگ و آزمون بازگشتی، تا افت کیفیت پیش از کاربر دیده شود.',
  },
  {
    icon: ShieldCheck,
    title: 'حاکمیت داده',
    body: 'داده در مرز سازمان می‌ماند. رمزنگاری، حسابرسی دسترسی و امکان اجرای کامل به‌صورت آفلاین.',
  },
  {
    icon: Boxes,
    title: 'یکپارچه‌سازی',
    body: 'اتصال به سامانه‌های موجود شما — از پایگاه‌داده و انبار داده تا سرویس‌های داخلی — بدون بازنویسی از صفر.',
  },
] as const

export default function HomePage() {
  return (
    <>
      <Hero />

      {/* Stage 2 · column — stat cards float over the plume at odd offsets,
          deliberately not aligned to each other or to the text. */}
      <Section
        eyebrow="در عمل"
        title="عددها را"
        titleTail="خودتان بسنجید"
        lead="این ارقام از استقرارهای واقعی می‌آید، نه از یک صفحهٔ فروش. زیرساخت را خودتان در اختیار دارید و می‌توانید همه را دوباره اندازه بگیرید."
        align="center"
      >
        <div className="relative mt-24 hidden h-[26rem] lg:block">
          <FloatingStat
            label="سرعت استقرار"
            value="۳"
            suffix="×"
            body="از ایده تا تولید در کسری از زمان، بدون آنکه کیفیت قربانی شود."
            className="start-[4%] top-0"
          />
          <FloatingStat
            label="میانگین بهبود کارایی"
            value={68}
            suffix="٪"
            body="اندازه‌گیری‌شده در چند صنعت. اعداد واقعی از استقرارهای واقعی."
            className="end-[8%] top-32"
            depth="far"
          />
          <FloatingStat
            label="هزینهٔ توکن"
            value={0}
            body="مدل روی سخت‌افزار خودتان اجرا می‌شود؛ هزینهٔ هر گفت‌وگو صفر است."
            className="start-[26%] top-56"
          />
        </div>
      </Section>

      {/* Stage 3 · helix */}
      <Section
        eyebrow="توانمندی‌ها"
        title="آنچه می‌سازیم،"
        titleTail="روی زیرساخت خودتان اجرا می‌شود"
        lead="هر لایه از سامانه در اختیار شماست: مدل، داده، و سرورها. هیچ بخشی از این معماری به سرویسی وابسته نیست که فردا ممکن است در دسترس نباشد."
        id="capabilities"
      >
        <div className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <GlassCard key={title} interactive>
              <Icon className="size-5 text-accent" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="mt-5 font-display text-xl font-normal text-text-100">{title}</h3>
              <p className="mt-3 text-sm leading-fa-normal text-text-300">{body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Stage 4 · terrain — content sits high, leaving the lower third for the
          landscape, exactly as the reference frames it. */}
      <Section
        eyebrow="کشش نتیجه"
        title="همه‌چیز حول یک چیز می‌چرخد —"
        titleTail="رشد شما"
        lead="هزاران نقطهٔ داده. یک مرکز ثقل. نوفهٔ اطلاعات را به نقطه‌ای متمرکز از انرژی برای کسب‌وکار شما تبدیل می‌کنیم."
        actions={
          <>
            <ButtonLink href="/contact" size="lg" withArrow>
              شروع کنید
            </ButtonLink>
            <ButtonLink href="/services" variant="ghost" size="lg">
              رزرو دمو
            </ButtonLink>
          </>
        }
      />

      {/* Stage 5 · black hole */}
      <Section
        eyebrow="مرکز ثقل"
        title="بیایید دربارهٔ سامانهٔ شما"
        titleTail="گفت‌وگو کنیم"
        lead="دستیار هوشمند این سایت روی همان زیرساختی اجرا می‌شود که برای شما می‌سازیم. هستهٔ روشن را لمس کنید تا از آن بپرسید — یا مستقیم با ما تماس بگیرید."
        align="center"
        actions={
          <>
            <ButtonLink href="/contact" size="lg" withArrow>
              تماس با ما
            </ButtonLink>
            <ButtonLink href="/blog" variant="ghost" size="lg">
              مطالعهٔ بینش‌ها
            </ButtonLink>
          </>
        }
      />
    </>
  )
}
