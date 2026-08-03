import { Boxes, Cpu, Database, Radar, ShieldCheck, Workflow } from 'lucide-react'

import { Hero } from '@/components/sections/Hero'
import { Section } from '@/components/sections/Section'
import { ButtonLink } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { faNumber } from '@/lib/utils'

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

const STATS = [
  { value: 0, suffix: 'ریال', label: 'هزینهٔ توکن به‌ازای هر گفت‌وگو', hint: 'مدل روی سخت‌افزار خودتان' },
  { value: 100, suffix: '٪', label: 'متن‌باز', hint: 'بدون قفل‌شدن به فروشنده' },
  { value: 768, suffix: '', label: 'بُعد بردار فارسی', hint: 'مدل تعبیهٔ حکیم' },
  { value: 24, suffix: '/۷', label: 'اجرای مستقل', hint: 'بدون نیاز به اینترنت بین‌المللی' },
] as const

export default function HomePage() {
  return (
    <>
      <Hero />

      <Section
        eyebrow="توانمندی‌ها"
        title="آنچه می‌سازیم،"
        titleTail="روی زیرساخت خودتان اجرا می‌شود"
        lead="هر لایه از سامانه در اختیار شماست: مدل، داده، و سرورها. هیچ بخشی از این معماری به سرویسی وابسته نیست که فردا ممکن است در دسترس نباشد."
        id="capabilities"
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <GlassCard key={title} interactive>
              <Icon className="size-5 text-accent" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="mt-5 font-display text-xl font-normal text-text-100">{title}</h3>
              <p className="mt-3 text-sm leading-fa-normal text-text-300">{body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="در یک نگاه"
        title="اعدادی که"
        titleTail="معماری را توضیح می‌دهند"
      >
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <GlassCard key={stat.label} etch={false}>
              <dd className="font-display text-4xl font-light text-text-100">
                {faNumber(stat.value)}
                <span className="text-2xl text-text-300">{stat.suffix}</span>
              </dd>
              <dt className="mt-3 text-sm text-text-200">{stat.label}</dt>
              <p className="mt-1 text-xs text-text-400">{stat.hint}</p>
            </GlassCard>
          ))}
        </dl>
      </Section>

      <Section
        title="بیایید دربارهٔ سامانهٔ شما"
        titleTail="گفت‌وگو کنیم"
        lead="دستیار هوشمند این سایت روی همان زیرساختی اجرا می‌شود که برای شما می‌سازیم. از آن بپرسید — یا مستقیم با ما تماس بگیرید."
      >
        <div className="flex flex-col gap-4 sm:flex-row">
          <ButtonLink href="/contact" size="lg" withArrow>
            تماس با ما
          </ButtonLink>
          <ButtonLink href="/blog" variant="ghost" size="lg">
            مطالعهٔ بینش‌ها
          </ButtonLink>
        </div>
      </Section>
    </>
  )
}
