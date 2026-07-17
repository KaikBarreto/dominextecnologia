// Fase 6: inglês GENERALIZADO (sem lei/imposto/órgão específico do Brasil).
// Override parcial sobre o pt-br (fonte). Marca "Dominex" mantida. Sem travessão
// (—) na copy: usar vírgula/ponto-e-vírgula.
//
// Institucionais legais (privacidade/termos) são TRADUÇÃO AUTOMÁTICA de texto
// jurídico, generalizada; precisam de revisão profissional antes de virar
// oficial (ver relatório de entrega).
import type { MessagesOverride } from './index';

export const enOverrides: MessagesOverride = {
  languageSelector: {
    label: 'Language',
    ariaLabel: 'Select language',
  },

  // ── Sign up (/cadastro) ────────────────────────────────────────────────────
  registration: {
    logoTagline: 'Master how your business runs.',
    title: 'Sign up',
    subtitle: '14-day free trial · No commitment · Full access',

    steps: {
      data: 'Details',
      segment: 'Industry',
      origin: 'Source',
      access: 'Access',
      success: 'Done',
    },

    companyName: 'Company Name*',
    companyNamePlaceholder: 'e.g. Acme Inc.',
    contactName: 'Your Full Name*',
    contactNamePlaceholder: 'e.g. John Smith',
    email: 'Email*',
    emailPlaceholder: 'email@example.com',
    phone: 'Phone*',
    phonePlaceholder: '+1 (555) 123-4567',
    emailChecking: 'Checking availability…',
    emailTaken: 'This email is already in use. Log in or use another email.',

    addressTitle: 'Company address',
    addressOptional: '(optional)',
    cep: 'ZIP / Postal code',
    cepPlaceholder: '00000',
    street: 'Street',
    streetPlaceholder: 'Street, avenue...',
    number: 'Number',
    numberPlaceholder: '123',
    complement: 'Complement',
    complementPlaceholder: 'Suite, unit...',
    neighborhood: 'District',
    neighborhoodPlaceholder: 'District',
    city: 'City',
    cityPlaceholder: 'City',
    state: 'State',
    statePlaceholder: 'State',

    segmentTitle: 'What does your business do?',
    segmentSubtitle: 'Select to personalize your experience',

    originTitle: 'How did you hear about us?',
    originSubtitle: 'Select where you came from',

    accessEmailLabel: 'Login email:',
    password: 'Password*',
    passwordPlaceholder: 'Create your password',
    confirmPassword: 'Confirm Password*',
    confirmPasswordPlaceholder: 'Repeat the password',
    trialLine1: '14 days free with full access',
    trialLine2: 'No credit card, no commitment',

    back: 'Back',
    continue: 'Continue',
    createAccount: 'Create Account',
    creating: 'Signing up...',

    haveAccount: 'Already have an account?',
    doLogin: 'Log in',

    customPlanTitle: 'Your custom plan',
    customPlanMonthly: 'Monthly price:',
    customPlanPromoSuffix: (months: string) => ` for the first ${months} months`,

    toastCepNotFound: 'Postal code not found',
    toastCepNotFoundDesc: 'Check the code and try again.',
    toastCepError: 'Could not look up the postal code',
    toastCepErrorDesc: 'Fill in the address manually.',
    toastSuccess: 'Account created!',
    toastRedirectingPayment: 'Redirecting to payment...',
    toastRedirecting: 'Redirecting...',
    toastEmailTakenTitle: 'Email already registered',
    toastEmailTakenDesc: 'Log in or use another email.',
    toastError: 'Sign-up error',
    toastErrorFallback: 'Could not complete sign-up',
    toastSelectSegment: 'Select your industry',
    toastSelectSegmentDesc: 'Tell us what your business does.',
    toastSelectOrigin: 'Select a source',
    toastSelectOriginDesc: 'How did you hear about us?',
    toastPasswordMismatch: 'Passwords do not match',
    toastPasswordWeak: 'Weak password',
    toastPasswordWeakDesc:
      'Use at least 8 characters with uppercase, lowercase, numbers and/or special characters.',

    errorCompanyNameRequired: 'Company name is required',
    errorContactNameRequired: 'Name is required',
    errorEmailRequired: 'Email is required',
    errorEmailInvalid: 'Invalid email',
    errorPhoneRequired: 'Phone is required',
    errorPasswordRequired: 'Password is required',
    errorPasswordMinReqs: 'Password does not meet the minimum requirements',
    errorConfirmPasswordRequired: 'Confirm the password',
  },

  // ── Log in (/login) + Reset password (/reset-password) ─────────────────────
  auth: {
    logoTagline: 'Master how your business runs.',
    orDivider: 'or',

    loginTitle: 'Log in',
    emailLabel: 'Email',
    emailPlaceholder: 'you@email.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot my password',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    continueWithGoogle: 'Continue with Google',
    noAccount: "Don't have an account yet?",
    signUp: 'Sign up',

    errorEmailRequired: 'Email is required',
    errorEmailInvalid: 'Invalid email',
    errorPasswordRequired: 'Password is required',

    toastWelcomeTitle: 'Welcome!',
    toastWelcomeDesc: 'Signed in successfully',
    toastPendingPaymentTitle: 'Payment pending',
    toastPendingPaymentDesc: 'Complete the payment to access the platform.',
    toastOtherSessionsDisconnected: 'Other sessions disconnected',
    toastLoginCanceled: 'Sign-in canceled',

    errorUnexpected: 'An unexpected error occurred. Please try again.',
    errorContinueLogin: 'Error continuing sign-in.',

    gotrueErrors: {
      invalidCredentials: 'Incorrect email or password. Check your credentials and try again.',
      emailNotConfirmed: 'Email not confirmed. Please check your inbox.',
      rateLimited: 'Too many attempts. Please wait a moment and try again.',
      networkError: 'No internet connection. Check your network and try again.',
      generic: 'An unexpected error occurred. Please try again.',
    },

    forgot: {
      emailStepTitle: 'Reset password',
      emailStepSubtitle: 'Enter your email to receive the code',
      emailLabel: 'Email',
      emailPlaceholder: 'you@email.com',
      sendCode: 'SEND CODE',
      sending: 'Sending...',
      backToLogin: 'Back to login',
      errorEmailInvalid: 'Invalid email',

      codeStepTitle: 'Enter the code',
      codeStepSubtitle: (length: string) => `We sent a ${length}-digit code to`,
      verifyContinue: 'CONTINUE',
      verifying: 'Verifying...',
      resendIn: (seconds: string) => `Resend in ${seconds}s`,
      resendCode: 'Resend code',
      changeEmail: 'Change email',

      passwordStepTitle: 'New password',
      passwordStepSubtitle: 'Set your new access password',
      newPasswordLabel: 'New password',
      newPasswordPlaceholder: 'At least 6 characters',
      confirmPasswordLabel: 'Confirm password',
      confirmPasswordPlaceholder: 'Repeat the password',
      submit: 'RESET PASSWORD',
      submitting: 'Resetting...',
      back: 'Back',
      errorPasswordMin: 'Password must be at least 6 characters',
      errorPasswordMismatch: 'Passwords do not match',

      doneTitle: 'Password reset!',
      doneSubtitle: 'You can now sign in with your new password.',

      toastCodeSentTitle: 'Code sent',
      toastCodeSentDesc: 'Check your email, it may take up to 1 minute.',
      toastErrorTitle: 'Error',
      toastSendCodeFallback: 'Could not send the code',
      toastInvalidCodeTitle: 'Invalid code',
      toastInvalidCodeFallback: 'Check it and try again',
      toastResetErrorTitle: 'Error resetting password',
      toastResetFallback: 'Please try again',
    },

    reset: {
      verifying: 'Validating your reset link…',
      invalidTitle: 'Invalid link',
      invalidLinkMessage: 'Invalid link. Request a new reset from the login page.',
      invalidCodeFallback: 'Invalid or expired code',
      invalidValidateFallback: 'Failed to validate code',
      backToLogin: 'Back to login',
      successTitle: 'Password reset!',
      successSubtitle: 'Signing you in…',
      readyTitle: 'New Password',
      readySubtitlePre: 'Reset validated for',
      newPasswordLabel: 'New Password',
      newPasswordPlaceholder: 'Create a strong password',
      confirmPasswordLabel: 'Confirm Password',
      confirmPasswordPlaceholder: 'Repeat the password',
      submit: 'RESET PASSWORD',
      submitting: 'Resetting...',
      errorPasswordMin: 'Password must be at least 8 characters',
      errorPasswordReqs: 'Password does not meet the minimum requirements',
      errorPasswordMismatch: 'Passwords do not match',
      resetErrorFallback: 'Error resetting password',
      toastResetTitle: 'Password reset',
      toastResetDesc: 'Sign in with your new password.',
      toastErrorTitle: 'Error',
    },
  },

  nav: {
    platform: 'Platform',
    solutions: 'Solutions',
    segments: 'Industries',
    pricing: 'Pricing',
    blog: 'Blog',
    login: 'Log in',
    signup: 'Sign up',
    trialSticky: 'Start your 14-day free trial',
    openMenu: 'Menu',
    openMenuAria: 'Open menu',
    closeMenuAria: 'Close menu',
    solutionsMenuAria: 'Our solutions',
    solutionsMenuHeader: 'Everything the platform does',
    segmentsMenuAria: 'Our industries',
    segmentsMenuHeader: 'Our industries',
    solutionTaglines: {
      'os-digital': 'Work orders in the app, with photos, checklists and customer signature.',
      'sistema-pmoc': 'Automatic maintenance plans per equipment, on schedule.',
      'sistema-crm': 'Client pipeline and proposals all the way to closing the deal.',
      'controle-financeiro': 'Payables, receivables and cash flow under control.',
      'ponto-e-folha': 'Team time tracking, advances and payroll without side spreadsheets.',
      'emissao-de-nfse': 'Issue service invoices straight from the platform.',
      'portal-do-cliente': 'Your client follows work orders, quotes and history online.',
      'controle-de-estoque': 'Parts and materials deducted automatically on every work order.',
      'orcamentos-e-contratos': 'An approved quote becomes a contract and recurring work orders.',
      'rastreamento-de-equipes': 'Team on a live map and the day route organized.',
      'area-do-tecnico': 'Calculators, gas tables and an equipment catalog in your pocket.',
    },
    segmentTaglines: {
      'sistema-para-refrigeracao': 'Work orders, maintenance plans and gas tracking per unit.',
      'sistema-para-eletricistas': 'Reports, permits and installations under control.',
      'sistema-para-energia-solar': 'Design, installation and O&M of solar plants.',
      'sistema-para-provedores': 'Fiber install, support and technical visits.',
      'sistema-para-cftv': 'Cameras, alarms and patrols with full history.',
      'sistema-para-construcao-civil': 'Job sites, crews and field measurements.',
      'sistema-para-elevadores': 'Preventive maintenance and service calls on time.',
      'sistema-para-limpeza-conservacao': 'Sites, patrols and crews organized.',
      'sistema-para-dedetizacao': 'Certificates, pest management and recurring contracts.',
    },
  },

  moduleLabels: {
    'os-digital': 'Digital Work Orders',
    'sistema-pmoc': 'Maintenance Plans',
    'sistema-crm': 'CRM & Sales',
    'controle-financeiro': 'Finance',
    'ponto-e-folha': 'Time & Payroll (HR)',
    'emissao-de-nfse': 'Service Invoicing',
    'portal-do-cliente': 'Client Portal',
    'controle-de-estoque': 'Inventory',
    'orcamentos-e-contratos': 'Quotes & Contracts',
    'rastreamento-de-equipes': 'Tracking & Scheduling',
    'area-do-tecnico': 'Technician Toolkit™',
  },

  segmentLabels: {
    'sistema-para-refrigeracao': 'Refrigeration & HVAC',
    'sistema-para-eletricistas': 'Electrical Installations',
    'sistema-para-energia-solar': 'Solar Energy',
    'sistema-para-provedores': 'Telecom / ISPs',
    'sistema-para-cftv': 'CCTV & Electronic Security',
    'sistema-para-construcao-civil': 'Construction',
    'sistema-para-elevadores': 'Elevators',
    'sistema-para-limpeza-conservacao': 'Cleaning & Facilities',
    'sistema-para-dedetizacao': 'Pest Control',
  },

  footer: {
    tagline: 'Master how your business runs.',
    solutions: 'Solutions',
    segments: 'Industries',
    institutional: 'Company',
    linkAbout: 'About us',
    linkBlog: 'Blog',
    linkTerms: 'Terms of use',
    linkPrivacy: 'Privacy Policy',
    copyright: 'All rights reserved. Built for teams that master the field.',
    madeBy: 'Built by',
  },

  pageChrome: {
    ctaTrial: 'Start free for 14 days, no card',
    seePlans: 'See plans',
    seeAllPlans: 'See all plans',
    faqHeading: 'Frequently asked questions',
    problemLabel: 'The problem',
    withDominex: 'With Dominex',
    pricing: {
      heading: 'Transparent pricing, no surprises',
      subtitle:
        'Plans that scale with your operation. See the full lineup and pick what fits.',
    },
    segment: {
      painsHeading: 'The daily headaches, solved',
      painsSubheading: 'Where the operation stalls on improvisation, Dominex takes control',
      featuresHeading: 'Everything your operation needs, in one place',
      featuresSubheading:
        'From the service call to the report, Dominex covers every step of the field job',
      testimonialsHeading: 'Those who use Dominex never go back to improvising',
    },
    nicheSearchPlaceholder: 'Search industry...',
    nicheEmpty: 'No industry found.',
  },

  home: {
    hero: {
      typedPre: 'Master how your ',
      typedHighlight: 'business runs.',
      srHeadline:
        'Work order, maintenance and management software for HVAC and field service teams. Master how your business runs.',
      subtitle:
        'No more spreadsheets, chat threads and rework. Dominex centralizes your work orders, tracks your team and delivers real data so you can grow.',
      ctaPrimary: 'Start free for 14 days',
      ctaSecondary: 'See plans',
      videoUnsupported: 'Your browser does not support HTML5 video.',
      videoLabel: 'Dominex demo',
    },
    logos: {
      eyebrow: 'Companies already mastering their operations with Dominex',
    },
    problemSolution: {
      problemsTitle: 'Is your operation stuck on improvisation?',
      solutionsTitle: 'With Dominex, you get full control',
      problems: [
        'Work orders on paper or a lost spreadsheet',
        'Technician with no information in the field',
        'Clients calling "where is my technician?"',
        'Reports written by hand, hours later',
        'No visibility into what is happening right now',
      ],
      solutions: [
        'Digital work order created in seconds',
        'App for the technician with everything they need',
        'Real-time tracking on the map',
        'Automatic reports on completion',
        'Dashboard with live KPIs',
      ],
    },
    features: {
      heading: 'Everything your operation needs, in one place',
      subheading: 'From the service call to invoicing, Dominex covers every step of the job',
      cta: 'Free 14-day trial, no card required',
      items: [
        {
          title: 'Digital work orders',
          description:
            'Create, assign and track work orders with photos, checklists, video responses, digital signature and full history. No more paper and rework.',
        },
        {
          title: 'Technician app in the field',
          description:
            'Installable mobile app: the technician receives the work order, checks in, takes photos and collects the customer signature, right from the field.',
        },
        {
          title: 'Scheduling and team tracking',
          description:
            'See the team on a live map, plan the day route and route service calls to the nearest technician, with no schedule conflicts.',
        },
        {
          title: 'Automatic maintenance plans',
          description:
            'Generate preventive maintenance plans per equipment, with visits, checklists and the schedule ready. Recurring preventive work on autopilot.',
        },
        {
          title: 'CRM and sales',
          description:
            'Client pipeline, quotes and proposals all the way to closing. Track every opportunity without missing a follow-up.',
        },
        {
          title: 'Complete finance',
          description:
            'Payables and receivables, cash flow, cards and categories. Know what comes in, what goes out and what you actually keep.',
        },
        {
          title: 'Time and payroll (HR)',
          description:
            'Team time tracking, advances, bonuses and payroll. Pay slips ready, with no side spreadsheet.',
        },
        {
          title: 'NFS-e issuance (Service Invoice)',
          description:
            'Issue service invoices straight from the platform, per client, following your local tax rules.',
        },
        {
          title: 'Client portal',
          description:
            'Your client follows work orders, quotes and history by link, without calling. More transparency, fewer phone calls.',
        },
        {
          title: 'Inventory control',
          description:
            'Parts and materials deducted automatically on every work order. Know what is on hand before you promise a deadline.',
        },
        {
          title: 'Quotes and contracts',
          description:
            'An approved quote by link becomes a contract and recurring work orders. From "deal closed" to a scheduled job without retyping everything.',
        },
        {
          title: 'Technician Toolkit™',
          description:
            'Calculators, gas tables and an equipment catalog in the technician pocket, the toolbox that was missing on their phone.',
        },
        {
          title: 'Reports and metrics',
          description:
            'Dashboard with work orders by status, average handling time and customer ratings. Decisions based on data, not guesswork.',
        },
      ],
    },
    howItWorks: {
      heading: 'Simple to start, powerful to scale',
      steps: [
        {
          title: 'Register your clients and technicians',
          desc: 'Import or add them in minutes. Set up groups, regions and permissions for each profile.',
        },
        {
          title: 'Create and dispatch work orders',
          desc: 'Open a work order in seconds, assign it to the right technician and track it live on the dashboard.',
        },
        {
          title: 'Analyze and grow',
          desc: 'Automatic reports, customer ratings and performance metrics for faster decisions.',
        },
      ],
    },
    productMockup: {
      heading: 'The dashboard your team will love to use',
      subheading: 'An intuitive, powerful interface designed for field team managers',
      searchPlaceholder: 'Search work orders...',
      filters: 'Filters',
      liveMap: 'Live map',
      sidebar: {
        dashboard: 'Dashboard',
        serviceOrders: 'Work Orders',
        schedule: 'Schedule',
        clients: 'Clients',
        settings: 'Settings',
      },
      status: {
        open: 'Open',
        inProgress: 'In progress',
        done: 'Completed',
        blocked: 'Blocked',
      },
    },
    testimonials: {
      heading: 'Those who use Dominex never go back to improvising',
      items: [
        {
          quote:
            'We used to lose 3 hours a day on manual reports. Now we close everything in 15 minutes. Real results.',
          role: 'Operations Manager',
        },
        {
          quote:
            'The field team gained autonomy and our clients started trusting our service more.',
          role: 'Director',
        },
        {
          quote:
            'Within 2 weeks we had full visibility of our work orders. Never lost a service call again.',
          role: 'Founder',
        },
      ],
    },
    segments: {
      heading: 'For any company with a team in the field',
      subheading: 'We serve many field service industries',
      hoverHint: 'Click to see more',
      ariaSuffix: 'see Dominex for this industry',
      imageAltPrefix: 'Dominex for',
    },
    pricing: {
      heading: 'Plans that grow with your operation',
      monthly: 'Monthly',
      annual: 'Annual',
      annualDiscount: '-20%',
      mostPopular: '⭐ Most popular',
      priceEquivalent: 'equivalent to',
      priceFrom: 'starting at',
      perMonth: '/mo',
      featuresLabel: 'Features',
      currencyPrefix: '$',
      annualStrike: (monthly: number) => `$${monthly}/mo`,
      annualTotal: (total: number) => `Total: $${total}/yr · Save 20%`,
      ctaTrial: 'Start 14-Day Free Trial',
      enterpriseBadge: 'Enterprise',
      plans: {
        start: {
          name: 'Essential',
          desc: 'Basic management for small teams',
          features: [
            'Unlimited work orders',
            '5 users included',
            'App for technicians',
            'Schedule and calendar',
            'Client portal',
            'Basic reports',
            'Email support',
          ],
        },
        avancado: {
          name: 'Pro',
          desc: 'For companies that need HR and finance',
          features: [
            'Everything in Essential +',
            '10 users included',
            'Employees / HR module',
            'Advanced finance',
            'Payables/receivables',
            'Income statement and financial reports',
            'Contract and maintenance-plan management',
          ],
          videoChecklist: 'up to 1 video per checklist',
        },
        master: {
          name: 'Business',
          desc: 'Complete operation with CRM and portal',
          features: [
            'Everything in Pro +',
            '15 users included',
            'CRM / Sales pipeline',
            'NFS-e issuance (Service Invoice)',
            'Advanced pricing (markup)',
            'White label (your brand)',
            'Priority support',
          ],
          videoChecklist: 'up to 3 videos per checklist',
        },
        enterprise: {
          name: 'Enterprise Plan',
          desc: 'Tailor a plan built to fit your operation.',
          cta: 'Talk to a Consultant',
        },
      },
    },
    faq: {
      heading: 'Frequently asked questions',
      items: [
        {
          q: 'What type of company is Dominex for?',
          a: 'For companies that provide technical field services: refrigeration and HVAC, preventive maintenance, electrical, pest control, telecom, electronic security, installations, technical support and any operation involving field teams and work orders.',
        },
        {
          q: 'Does it work on mobile? Is there an app for technicians?',
          a: 'Yes. The platform is 100% web and responsive (works in any browser) and the technician uses an installable PWA app on Android and iOS, with check-in/out, photos, digital signature and checklists.',
        },
        {
          q: 'How does the free trial work?',
          a: 'It is 14 days with full access to the plan you choose, with no credit card required. You can cancel at any time and your data is preserved if you decide to subscribe later.',
        },
        {
          q: 'Is work order data stored forever?',
          a: 'Yes. We keep the full history of work orders, equipment, clients and reports with no retention limit while your subscription is active, ensuring traceability for warranties, audits and maintenance plans.',
        },
        {
          q: 'Can I manage maintenance plans and recurring contracts?',
          a: 'Yes. Dominex automatically generates the work orders for maintenance contracts (monthly, bimonthly, quarterly, etc.) and keeps the maintenance schedule organized by equipment and client.',
        },
        {
          q: 'Can I customize forms, checklists and reports?',
          a: 'Yes. You create checklist templates per service type, define required fields, photos, signature and video responses. On the Pro and Business plans, the technician can record a short clip (up to 15 seconds) as a checklist answer, straight from their phone in the field, and the customer sees the video in the work order link. Work order reports are generated as PDFs with your brand, colors and logo.',
        },
        {
          q: 'Is there an integrated CRM and sales pipeline?',
          a: 'Yes. The Business plan includes a complete CRM with a Kanban pipeline, customizable stages, webhooks for lead capture and direct conversion into quotes and work orders.',
        },
        {
          q: 'Can I manage finance, payables and income statements?',
          a: 'Yes. Starting on the Pro plan you get payables/receivables, multiple bank accounts, cash flow, recurring entries, reconciliation by category and an income statement for results analysis.',
        },
        {
          q: 'How does employee time tracking and payroll work?',
          a: 'The HR module allows employees to clock in and out themselves, plus control of hours, absences, advances, bonuses and generation of individual statements calculated proportionally to the work schedule.',
        },
        {
          q: 'Can I have more users than the plan allows?',
          a: 'Yes. You can add extra users to any plan for an additional monthly fee, or move to a higher plan when you need more resources.',
        },
        {
          q: 'What is support like? Do I talk to a real person?',
          a: 'Yes. Human support by chat and email during business hours. The Business and Enterprise plans include priority support and a dedicated account manager.',
        },
        {
          q: 'Is my data safe? What about data protection?',
          a: 'We use cloud infrastructure with encryption in transit and at rest, automatic backups and isolation between companies (multi-tenant). We follow a continuous data-protection compliance process, and you can read our Privacy Policy for details on collection, use and your rights as a data subject.',
        },
      ],
    },
    ctaFinal: {
      heading: 'Start today. Results in days.',
      subtitle:
        '14 days free, no card, no red tape. Set up in minutes and watch your team gain productivity.',
      ctaPrimary: 'Create my free account',
      ctaSecondary: 'Or schedule a demo',
    },
  },

  quemSomos: {
    heroBadge: 'About Dominex',
    heroTitlePre: 'Master the field,',
    heroTitleHighlight: 'master the operation',
    heroSubtitle:
      'Dominex exists to take field service work out of the paperwork. One system, on mobile and desktop, to run the operation from quote to receipt.',
    ctaTrial: 'Free 14-day trial, no card required',
    ctaPricing: 'See plans',
    missionTitle: 'Our mission',
    missionP1Strong: 'work order, maintenance and management',
    missionP1:
      'Dominex is a {strong} system built for service companies and field teams: refrigeration and HVAC, electrical, solar energy, CCTV, internet providers, elevators, pest control, cleaning and facilities, construction and much more.',
    missionP2:
      'We believe the technician should not waste time on paper work orders, nor should the manager be left in the dark about what is happening in the field. That is why we bring together in one place what used to be scattered across notebooks, chat groups and spreadsheets: CRM, quotes, contracts, work orders, maintenance plans, team tracking, inventory control, finance and payroll.',
    missionP3:
      'Our commitment is simple: keep the operation organized, traceable and easy to run, so you can focus on doing the job well, not on bureaucracy.',
    valuesTitle: 'What we believe in',
    valuesSubtitle: 'The principles that guide every decision about the product.',
    values: [
      {
        title: 'Everything on the technician phone',
        body: 'Field teams need everything at hand. The app installs on the phone and the technician opens the work order, records photos, checklists and signature right at the job site, no paper and no trip back to the office.',
      },
      {
        title: 'Built for teams that master the field',
        body: 'We were born close to the service operation, not the spreadsheet. Every screen is designed for the technician on the street and the manager who needs to see everything from afar.',
      },
      {
        title: 'Fast to get started',
        body: 'No endless rollout. You create the account, register your team and start issuing work orders the same day, no card to try it.',
      },
      {
        title: 'Your data is yours',
        body: 'Isolation per company, permission-based access control and always-traceable documents. Each client sees only what is theirs.',
      },
      {
        title: 'From quote to receipt',
        body: 'CRM, quotes, work orders, maintenance plans, finance and payroll in the same place. One system to run the job end to end.',
      },
      {
        title: 'Support that knows the trade',
        body: 'We speak the language of field service providers. When you reach out, on the other side there is someone who knows your routine.',
      },
    ],
    finalCtaTitle: 'Try Dominex in your operation',
    finalCtaSubtitle:
      'It is 14 days free, with no credit card. Register your team and start issuing work orders today.',
  },

  // Legal text below is an AUTOMATIC, GENERALIZED translation. Needs professional
  // review before being treated as official (see delivery report).
  privacidade: {
    back: '← Back',
    title: 'Privacy Policy',
    version: 'Version 1.0 — last updated: April 2026',
    s1Title: '1. Data Controller Identification',
    s1P1Strong: 'Dominex Tecnologia',
    s1P1: '{strong} is the controller of the personal data processed on this platform, under applicable data protection law.',
    s1DpoStrong: 'Data Protection Officer (DPO):',
    s1Dpo: 'In the process of being appointed under applicable data protection law.',
    s1Contact: 'Contact channel:',
    s2Title: '2. Personal Data Collected',
    s2Intro: 'We collect the following categories of personal data:',
    s2Items: [
      { strong: 'Registration:', rest: 'name, email, phone, tax ID' },
      { strong: 'Access:', rest: 'login logs, IP address, user agent, active sessions' },
      { strong: 'Employee:', rest: 'name, tax ID, phone, address, payment key, salary, work schedule' },
      { strong: 'Geolocation:', rest: 'GPS coordinates of technicians during service visits (every 30s)' },
      { strong: 'Biometric/image:', rest: 'selfies for time clock records and equipment photos' },
      { strong: 'Client company end-customers:', rest: 'name, tax ID, email, phone, address, equipment' },
      { strong: 'Financial:', rest: 'transaction records (no credit card data, processed by external gateways)' },
    ],
    s3Title: '3. Purposes and Legal Bases',
    s3ColPurpose: 'Purpose',
    s3ColBasis: 'Legal Basis',
    s3Rows: [
      ['Providing the work order and team management service', 'Contract performance'],
      ['Time tracking and work schedule control', 'Compliance with a legal obligation'],
      ['Tracking technicians in the field during service visits', 'Legitimate interest and consent'],
      ['Time clock records with selfie (biometrics)', 'Specific consent'],
      ['Communication about the contracted service', 'Contract performance'],
      ['Platform improvement and security', 'Legitimate interest'],
      ['Compliance with tax and accounting obligations', 'Compliance with a legal obligation'],
    ] as [string, string][],
    s4Title: '4. Sharing with Third Parties (Sub-processors)',
    s4Items: [
      { strong: 'Supabase Inc.', rest: '(USA) — database, authentication and file storage. International transfer based on standard contractual clauses.' },
      { strong: 'OpenStreetMap/Nominatim', rest: '— address geocoding (proxied by the server, without directly sending the user IP).' },
      { strong: 'Address lookup service', rest: '— postal code lookup for address auto-fill.' },
      { strong: 'Payment gateways', rest: '— charge processing. We have no access to card data.' },
    ],
    s4Note: 'We do not sell, rent or share personal data with third parties for advertising purposes.',
    s5Title: '5. Data Retention',
    s5Items: [
      'Account data: while the contract is active + 90 days after termination',
      'Tax and financial records: 5 years (legal obligation)',
      'Access logs: 6 months',
      'Geolocation data: 12 months',
      'Time clock data: 5 years (labor obligation)',
    ],
    s6Title: '6. Data Subject Rights',
    s6Intro: 'You have the following rights regarding your personal data:',
    s6Items: [
      'Confirmation that processing exists',
      'Access to the data',
      'Correction of incomplete, inaccurate or outdated data',
      'Anonymization, blocking or deletion of unnecessary data',
      'Data portability (structured format)',
      'Deletion of data processed based on consent',
      'Information about sharing with third parties',
      'Withdrawal of consent',
    ],
    s6OutroPre: 'To exercise your rights, go to the ',
    s6OutroLink: 'Data Center',
    s6OutroMid: ' or send an email to ',
    s6OutroPost: '.',
    s7Title: '7. Cookies and Tracking Technologies',
    s7P: 'We use only essential cookies for the platform to work (authentication and session preferences). We do not use tracking or advertising cookies. The Montserrat font is loaded locally, with no connection to Google Fonts.',
    s8Title: '8. Security',
    s8P: 'We adopt technical and organizational measures to protect your data: TLS encryption in transit, access control per company (multi-tenant with row-level security in the database), secure authentication and security monitoring.',
    s9Title: '9. Changes to this Policy',
    s9P: 'This policy may be updated periodically. When significant changes occur, we will notify you by email or notice on the platform. The version and update date are always shown at the top.',
    s10Title: '10. Contact and DPO',
    s10P: 'For questions, requests or complaints related to privacy and data protection:',
    s10NotePre: 'You may also file a complaint with the data protection authority in your jurisdiction. ',
    s10NoteUrl: '',
    s10NoteUrlLabel: '',
    s10NotePost: '',
  },

  termos: {
    back: '← Back',
    title: 'Terms of Use',
    version: 'Version 1.0 — last updated: April 2026',
    s1Title: '1. Acceptance of Terms',
    s1Pre: 'By registering and using the Dominex platform, you ("User") agree to these Terms of Use and to our ',
    s1Link: 'Privacy Policy',
    s1Post: '. If you do not agree, do not use the service.',
    s2Title: '2. Description of the Service',
    s2P: 'Dominex is a SaaS (Software as a Service) platform for managing field teams, work orders, clients, equipment, finance and human resources, intended for companies that provide technical services.',
    s3Title: '3. Registration and Account',
    s3Items: [
      'The User is responsible for the accuracy of the information provided at registration.',
      'The account is personal and non-transferable. Do not share your credentials.',
      'The User is responsible for all activity performed under their account.',
      'Report any unauthorized access to your account immediately.',
    ],
    s4Title: '4. Trial Period',
    s4P: 'We offer a free 14-day period with access to the selected plan. When the period ends, the account is automatically suspended if there is no active subscription. Data is kept for an additional 90 days for possible reactivation.',
    s5Title: '5. Data Ownership',
    s5Pre: 'The data entered into the platform (clients, work orders, employees, finance) is owned by the client company. Dominex processes it exclusively to provide the contracted service, under the terms of the ',
    s5Link: 'Privacy Policy',
    s5Post: '.',
    s6Title: '6. Acceptable Use',
    s6Intro: 'It is prohibited to use the platform for:',
    s6Items: [
      'Illegal activities or activities that violate third-party rights',
      'Sending spam or malicious content',
      'Attempts at unauthorized access to systems or data',
      'Reselling or sublicensing the service without authorization',
      'Reverse engineering or source-code extraction',
    ],
    s7Title: '7. Availability and SLA',
    s7P: 'We strive to keep the platform available 24/7, but we do not guarantee uninterrupted availability. Scheduled maintenance will be communicated at least 24 hours in advance.',
    s8Title: '8. Suspension and Cancellation',
    s8P: 'We reserve the right to suspend or terminate accounts that violate these Terms, after notifying the User. Voluntary cancellation can be done at any time in the account settings.',
    s9Title: '9. Limitation of Liability',
    s9P: 'Dominex is not liable for indirect damages, data loss due to the User failing to keep their own backups, or interruptions caused by force majeure or third-party failures (internet providers, cloud infrastructure).',
    s10Title: '10. Changes to the Terms',
    s10P: 'We may update these Terms periodically. Significant changes will be communicated at least 30 days in advance by email. Continued use of the service after the changes implies acceptance.',
    s11Title: '11. Governing Law and Venue',
    s11P: 'These Terms are governed by applicable law. Any disputes will be resolved before the competent courts of the provider registered location.',
    s12Title: '12. Contact',
    s12Pre: 'Questions about these Terms: ',
  },

  // ── Blog (chrome/layout) ────────────────────────────────────────────────────
  blog: {
    badge: 'Dominex Blog',
    heroLine1: 'Content for those who',
    heroHighlight: 'run the field',
    subtitle: 'Work orders, preventive maintenance, team management and how to take your operation off paper.',
    searchPlaceholder: 'Search articles...',

    resultsSingular: (query: string) => `result for “${query}”`,
    resultsPlural: (query: string) => `results for “${query}”`,

    featured: 'Featured',
    recent: 'Recent',

    emptySearch: 'No articles found for this search.',
    emptyAll: 'No articles yet. Check back soon.',
    emptyCategory: 'No articles in this category.',

    ctaMobileTitle: 'Take your operation off paper',
    ctaMobileBody: 'Try Dominex for free and see the work order in the technician’s pocket.',
    ctaTrialNoCard: 'Start free for 14 days, no card',

    sidebar: {
      eyebrow: 'For field teams',
      ctaTitle: 'Want to take your operation off paper?',
      ctaBody:
        'Dominex puts work orders, maintenance and your team in the technician’s pocket, no notebook and no WhatsApp group.',
      ctaButton: 'Start your 14-day free trial',
      noCard: 'No credit card required.',
      mostRead: 'Most read',
      reads: 'reads',
      empty: 'No articles yet.',
    },

    backToSite: 'Back to site',

    defaultAuthor: 'Dominex Team',
    minSuffix: 'min',

    // ── Post page chrome ────────────────────────────────────────────────────
    commentCount: (n: number) => `${n} comment${n === 1 ? '' : 's'}`,

    commentsTitle: (n: number) => `Comments (${n})`,
    commentSentBanner:
      'Comment submitted! It will appear here once approved by our team.',
    commentNamePlaceholder: 'Your name',
    commentContentPlaceholder: 'Leave a comment...',
    commentDisclaimer: 'Your comment goes through approval before it appears.',
    commentSubmit: 'Comment',
    commentEmpty: 'No comments yet. Be the first!',

    toastCommentSent: 'Comment submitted! Awaiting approval.',
    toastCommentError: 'Could not send your comment. Please try again.',

    postCtaTitle: 'Ready to take your operation off paper?',
    postCtaBody:
      'Try Dominex free for 14 days and see work orders in your technician\'s pocket.',
    postCtaButton: 'Start free for 14 days, no card',

    tocLabel: 'In this article',

    relatedTitle: 'Read also',

    readsSingular: 'read',
    readsPlural: 'reads',
  },

  // ── System footer ───────────────────────────────────────────────────────────
  systemFooter: {
    developedBy: 'Developed by',
    rights: 'All Rights Reserved',
    refreshTitle: 'Refresh app',
    refreshing: 'Refreshing app...',
  },

  // ── Logged-in app (i18n) ─────────────────────────────────────────────────────
  // O namespace `app` NÃO é sobrescrito aqui: ele é organizado por domínio em
  // messages/app/* (4 locales por arquivo) e injetado por locale em
  // messages/index.ts (appByLocale). Ver messages/app/index.ts.
};

export default enOverrides;
