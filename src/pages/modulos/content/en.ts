// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo en (English) de módulos, traduções nativas (Fase 6, piloto inglês).
//
// Record keys = slug pt-br canônico (idêntico ao pt-br.ts). O campo `slug` de
// cada módulo define o endereço em inglês (/en/<slug>) via slugRegistry.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ClipboardList,
  ShieldCheck,
  Users,
  Wallet,
  Clock,
  FileText,
  UserCircle,
  Boxes,
  FileSignature,
  MapPin,
  Wrench,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  Download,
  Camera,
  PenLine,
  CheckSquare,
  QrCode,
  TrendingUp,
  Receipt,
  CreditCard,
  Landmark,
  CalendarClock,
  HandCoins,
  Banknote,
  FileCheck2,
  Building2,
  Package,
  PackageMinus,
  Route as RouteIcon,
  Navigation,
  Gauge,
  Calculator,
  BookOpen,
  Eye,
  Send,
  Repeat,
} from 'lucide-react';
import type { ModuleContentMap } from './types';


const en: ModuleContentMap = {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Digital Work Order
  // ────────────────────────────────────────────────────────────────────────
  'os-digital': {
    slug: 'digital-work-order-software',
    metaTitle: 'Digital Work Order Software for Field Service Teams | Dominex',
    metaDescription:
      'Digital work order software for field service teams: work orders on the technician\'s phone, checklists, before and after photos, customer signature, installable app, scheduling, and an automatic PDF report. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Digital Work Orders',
      h1: 'Digital work order software for field service teams',
      h1Highlight: 'digital work order',
      subtitle:
        'Say goodbye to paper work orders that go missing, arrive late, and show up with no photos. Dominex puts the work order on your technician\'s phone, with a checklist, photos, signature, and a report that is ready on the spot, out in the field.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Zero paper', label: 'work orders created, run, and closed in the app' },
      { value: 'On the phone', label: 'work orders completed by the technician in the field' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'Paper work orders cost you every single day',
    painsSubheading: 'Where work orders break down into improvisation, Dominex brings back control',
    pains: [
      {
        pain: '"Where is the work order from yesterday\'s job?"',
        solution:
          'Every work order is recorded in the system, linked to the customer, the equipment, and the technician in charge. Search by number, customer, or status and open the full history in seconds.',
      },
      {
        pain: 'The technician finished the job but took no photos and got no signature',
        solution:
          'The app enforces the steps: before and after photos, a completed checklist, and the customer signature on screen. Nothing gets closed halfway, and you have proof of the work done.',
      },
      {
        pain: 'Visit report typed hours later, at the end of the day',
        solution:
          'The moment the technician finishes the work order in the field, a branded PDF report is ready, with photos, checklist, and signature. You send it to the customer right away, with no rework back at the office.',
      },
      {
        pain: 'Jobs handed out over WhatsApp and nobody knows what is pending',
        solution:
          'The dashboard shows every work order by status: open, in progress, completed. You assign each one to the right technician and track the whole operation without making calls.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'The entire work order in the technician\'s hand',
        body: 'The technician opens the app, sees the day\'s job queue, taps into the work order, and gets everything: customer details, the address on a map, the equipment, the history of previous visits, and what needs to be done. They run the job, log it, and close the service without going back to the office or calling for information.',
        image: {
          src: '/modulos/os-digital/1.webp',
          alt: 'Two field technicians beside the van reviewing a work order on a tablet',
        },
      },
      {
        icon: Download,
        title: 'Installable app on the technician\'s phone',
        body: 'Dominex is an installable app (PWA) on the technician\'s phone, with no need to download it from an app store. The team opens the work order, takes photos, fills out the checklist, and collects the customer signature straight from the phone, out in the field. Everything the technician logs shows up instantly for the office to follow.',
        image: {
          src: '/modulos/os-digital/2.webp',
          alt: 'Technician in safety gear using a phone on a job site in the field',
        },
      },
      {
        icon: FileSignature,
        title: 'Checklist, photos, and signature generate the report on the spot',
        body: 'Build checklists by service type, capture before and after photos, and collect the customer signature right on the screen. When the job is done, the PDF work order report with your logo and colors is ready to send. The customer receives a professional document, and you have proof of every step of the job.',
        image: {
          src: '/modulos/os-digital/3.webp',
          alt: 'Technician holding a clipboard with an inspection checklist and pen',
        },
      },
    ],
    featuresHeading: 'Everything your work order needs, in one place',
    featuresSubheading: 'From the request to the report, digital work orders cover every step',
    features: [
      { icon: ClipboardList, title: 'Fast work order creation', desc: 'Open installation, maintenance, and repair orders in seconds, already linked to the customer and equipment.' },
      { icon: CheckSquare, title: 'Checklist by service', desc: 'Checklist templates by service type keep every visit on the right track.' },
      { icon: Camera, title: 'Before and after photos', desc: 'Photo evidence attached to the work order proves the state of the job and protects your company.' },
      { icon: PenLine, title: 'Customer signature', desc: 'The customer signs on the phone screen and the signature goes into the final report.' },
      { icon: Download, title: 'Installable app', desc: 'Install Dominex on the technician\'s phone, like an app, with no app store.' },
      { icon: Calendar, title: 'Scheduling and dispatch', desc: 'See the day\'s queue and assign each job to the nearest technician, with no scheduling clashes.' },
      { icon: FileSignature, title: 'Automatic report', desc: 'A branded PDF ready the moment the job is done, with photos, checklist, and signature.' },
      { icon: BarChart3, title: 'Status dashboard', desc: 'Open, in progress, and completed work orders on a live view of your operation.' },
      { icon: Smartphone, title: 'Video response in the checklist', desc: 'On Pro and Business plans, the technician records a short clip (up to 15 s) as a checklist answer, right in the field. The customer sees the video in the work order link.' },
    ],
    testimonialsHeading: 'Nobody who went digital goes back to paper',
    testimonials: [
      { quote: 'Paper work orders went missing and customers asked for photos nobody took. Now everything lives in the app, with the signature and report on the spot.', name: 'Carlos M.', role: 'Operations Manager', company: 'maintenance company' },
      { quote: 'The technician arrives at the customer and already sees the history. No more "let me call the office to confirm".', name: 'Roberta S.', role: 'Technical Coordinator', company: 'repair services' },
      { quote: 'The branded report on the spot changed the face of the company. Customers trust the service more.', name: 'André P.', role: 'Founder', company: 'field services' },
    ],
    faq: [
      { q: 'What is a digital work order?', a: 'It is a work order created, run, and closed straight in the system and in the technician\'s app, with no paper. The whole visit, checklist, before and after photos, customer signature, and report, is recorded in Dominex and linked to the customer and the equipment.' },
      { q: 'Does the technician use the work order on their phone? Do they need to install any software?', a: 'Dominex is an installable app (PWA) on the technician\'s phone, with no app store download. In the field, they open the work order, take photos, fill out the checklist, and collect the customer signature straight from the phone, and everything they log shows up instantly for the office.' },
      { q: 'Can I attach photos and collect the customer signature on the work order?', a: 'Yes. Every work order accepts before and after photos and the customer signature captured on the phone screen. All of it goes into the final PDF report.' },
      { q: 'Does the system generate work order reports automatically?', a: 'Yes. When the work order is finished, the PDF report with your logo and colors is ready, with the completed checklist, photos, and signature. You send it to the customer right away.' },
      { q: 'Can I use different checklists per service type?', a: 'Yes. You create checklist templates by service type (installation, preventive, corrective) and the technician follows the right steps on every visit.' },
      { q: 'How do I hand out work orders to my team?', a: 'On the dashboard you see the day\'s queue and assign each work order to the technician in charge, tracking the status (open, in progress, completed) in real time.' },
      { q: 'Can the technician answer a checklist item with a video?', a: 'Yes, on Pro and Business plans. The technician records a short clip of up to 15 seconds straight from their phone in the field, as the answer to a checklist question. The video is saved to the work order and the customer can watch it in the work order link.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You set up your company in minutes and start opening work orders in the app.' },
    ],
    finalCta: {
      title: 'Move your work orders to digital',
      subtitle: 'Free for 14 days, no credit card. Take work orders off paper and put your field team in control.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 2. HVAC preventive maintenance plan
  // ────────────────────────────────────────────────────────────────────────
  'sistema-pmoc': {
    slug: 'hvac-maintenance-plan-software',
    metaTitle: 'HVAC Preventive Maintenance Plan Software | Dominex',
    metaDescription:
      'HVAC preventive maintenance plan software: a maintenance plan per unit of equipment, automatic recurring visits, a checklist per machine, an audit-ready maintenance report, and a QR code on each unit. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Automatic Maintenance Plans',
      h1: 'HVAC preventive maintenance plan software',
      h1Highlight: 'HVAC maintenance plan',
      subtitle:
        'Stop building your maintenance plan in a side spreadsheet. Dominex generates a preventive maintenance plan per unit of equipment, schedules the visits on its own, and delivers a report ready for any audit or inspection.',
    },
    metrics: [
      { value: 'Per plan', label: 'a maintenance program compliant and audit ready' },
      { value: 'Per machine', label: 'an individual maintenance plan per unit' },
      { value: 'Automatic', label: 'recurring visits generated by the system' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'The maintenance plan cannot be done in a rush',
    painsSubheading: 'Where the side spreadsheet fails, Dominex keeps you on schedule',
    pains: [
      {
        pain: 'A maintenance plan built by hand, with no trail and out of compliance',
        solution:
          'The system builds the maintenance program from the equipment on the contract, with the responsible technician, the visit cycle, and a checklist per machine.',
      },
      {
        pain: 'Missed this month\'s visit and the schedule fell apart',
        solution:
          'Maintenance visits are generated automatically on the right cycle (monthly, quarterly, semiannual). Each one is born with the maintenance routine for that phase of the plan.',
      },
      {
        pain: 'An auditor asked for the maintenance records and you had no document ready',
        solution:
          'The maintenance report and the compliance record come out as a branded PDF, with what was done on each visit and the responsible technician\'s signature. You present it on the spot.',
      },
      {
        pain: 'You do not know the maintenance history of each machine',
        solution:
          'The plan is per unit: each machine has its own schedule, its own checklist, and its own visit history. A QR code on the equipment leads straight to the record.',
      },
    ],
    deepDives: [
      {
        icon: RefreshCw,
        title: 'An automatic maintenance plan, audit ready',
        body: 'The preventive maintenance program for your air conditioning systems is built from the equipment on the contract. Dominex spreads the visits across the cycle, builds each visit\'s checklist by the phase of the plan, records the responsible technician, and generates the maintenance record and compliance report ready to present at an audit or inspection, with no side spreadsheet.',
        image: {
          src: '/modulos/sistema-pmoc/1.webp',
          alt: 'HVAC technician measuring refrigerant with gauges on an air conditioning condenser',
        },
      },
      {
        icon: Wrench,
        title: 'A maintenance plan per unit, not per contract',
        body: 'Each machine (split, multi-split, VRF, chiller, fan coil, self-contained) has its own maintenance schedule, with the right routine for each visit of the 12-month cycle. Auditors and customers see exactly what was done on each unit, when, and by whom.',
        image: {
          src: '/modulos/sistema-pmoc/2.webp',
          alt: 'Technician inspecting an air conditioning condenser unit with a flashlight',
        },
      },
      {
        icon: QrCode,
        title: 'QR code on the equipment and recurring visits',
        body: 'Stick a QR code on the machine: the technician points the camera and lands straight on that unit\'s record, with its history and the next scheduled visit. Recurring visits are generated by the system at the right interval, with the checklist ready, so preventive maintenance never depends on anyone\'s memory.',
        image: {
          src: '/modulos/sistema-pmoc/3.webp',
          alt: 'Technician servicing the connections of an outdoor air conditioning split unit',
        },
      },
    ],
    featuresHeading: 'A complete maintenance plan, from generation to inspection',
    featuresSubheading: 'Scheduled maintenance compliance without manual work',
    features: [
      { icon: RefreshCw, title: 'Automatic plan generation', desc: 'The plan is built from the equipment on the contract, with the visit cycle and responsible technician.' },
      { icon: Wrench, title: 'Plan per machine', desc: 'An individual schedule and checklist per unit, with the right routine on each visit.' },
      { icon: Calendar, title: 'Recurring visits', desc: 'The system schedules maintenance visits at the right interval, with no need to remember.' },
      { icon: CheckSquare, title: 'Checklist by phase', desc: 'Each visit of the 12-month cycle carries the matching maintenance routine.' },
      { icon: FileText, title: 'Compliance report', desc: 'The maintenance record and PDF report ready to present at an audit.' },
      { icon: QrCode, title: 'QR code on the equipment', desc: 'The technician scans and lands straight on the machine\'s history and next visit.' },
      { icon: FileSignature, title: 'Responsible technician signature', desc: 'The responsible technician signs the maintenance documents, carrying your company\'s identity.' },
      { icon: ShieldCheck, title: 'Scheduled maintenance compliance', desc: 'Everything on schedule and documented for your air conditioning systems.' },
    ],
    testimonialsHeading: 'The maintenance plan stopped being a nightmare',
    testimonials: [
      { quote: 'The maintenance plan was spreadsheet on top of spreadsheet. Now the system builds the schedule and the report on its own. I presented it at the audit without breaking a sweat.', name: 'Roberta S.', role: 'Responsible Technician', company: 'building HVAC' },
      { quote: 'A plan per machine changed everything. Each unit has its own history and its next visit already scheduled.', name: 'Carlos M.', role: 'Operations Manager', company: 'commercial refrigeration' },
      { quote: 'The QR code on the equipment was a find. The technician points the camera and is already on the right record.', name: 'André P.', role: 'Founder', company: 'air conditioning maintenance' },
    ],
    faq: [
      { q: 'What is a preventive maintenance plan and why does it matter?', a: 'A preventive maintenance plan is the documented program of scheduled maintenance for your air conditioning systems. It records preventive maintenance, the responsible technician, and each unit\'s history, so you stay on schedule and have the documentation ready whenever a client or an auditor asks for it.' },
      { q: 'Does Dominex generate the maintenance plan automatically?', a: 'Yes. The system builds the plan from the equipment on the contract, spreads the visits across the cycle, builds each visit\'s checklist, and generates the record and compliance report ready for an audit, with no side spreadsheet.' },
      { q: 'Is the maintenance plan per unit or per contract?', a: 'Per unit. Each machine has its own schedule, checklist, and visit history, with the right routine for each phase of the 12-month cycle.' },
      { q: 'Are maintenance visits scheduled on their own?', a: 'Yes. Recurring visits are generated by the system at the right interval (monthly, quarterly, semiannual), with the phase checklist ready. Preventive maintenance does not depend on the team\'s memory.' },
      { q: 'Is there a QR code on the equipment?', a: 'Yes. You stick a QR code on the machine and the technician, on scanning it, lands straight on that unit\'s record, with its history and the next scheduled visit.' },
      { q: 'Does the maintenance report come out with my branding?', a: 'Yes. The maintenance record and compliance report come out as a PDF with your logo and colors, with the responsible technician\'s signature, ready to hand to the customer and to an auditor.' },
      { q: 'Does it work for refrigeration as well as air conditioning?', a: 'Yes. It works for HVAC and refrigeration companies that maintain split, multi-split, VRF, chiller, cold room, fan coil, and self-contained units, with a plan and history per unit.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You register the equipment, set up the contract, and the maintenance plan is generated automatically.' },
    ],
    finalCta: {
      title: 'Generate the maintenance plan with no side spreadsheet',
      subtitle: 'Free for 14 days, no credit card. Register the equipment and have the maintenance plan ready for any audit.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 3. CRM (record key = pt-br slug 'sistema-crm')
  // ────────────────────────────────────────────────────────────────────────
  'sistema-crm': {
    slug: 'field-service-crm',
    metaTitle: 'CRM for Service and Maintenance Companies | Dominex',
    metaDescription:
      'CRM for service and maintenance companies: capture leads, organize your sales pipeline on a kanban board, assign each deal to a rep, and go from quote to proposal to contract, with direct conversion into a work order. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'CRM & Sales',
      h1: 'CRM for service and maintenance companies',
      h1Highlight: 'CRM',
      subtitle:
        'A lead came in on WhatsApp and died in your inbox? The Dominex CRM organizes your sales pipeline on a kanban board, assigns each opportunity to a rep, and takes it from first contact to a closed contract.',
    },
    metrics: [
      { value: 'Pipeline', label: 'opportunities organized on a kanban board' },
      { value: 'Lead to work order', label: 'from first contact to the job' },
      { value: 'Per rep', label: 'individual assignment and tracking' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'A lead that does not become a sale is money left on the table',
    painsSubheading: 'Where the handling gets lost in improvisation, the CRM organizes the conversion',
    pains: [
      {
        pain: 'A lead comes in and nobody knows who is handling it',
        solution:
          'Every opportunity enters the pipeline and is assigned to a rep in charge. You see who is handling it, what stage it is in, and what is left to close.',
      },
      {
        pain: 'The pipeline lives in the rep\'s head, with zero visibility',
        solution:
          'The kanban pipeline shows every opportunity by stage, from first contact to closing. You see the whole pipeline and where the deal is stalling.',
      },
      {
        pain: 'Quote, proposal, and contract scattered across loose files',
        solution:
          'From the lead comes the quote, which becomes the proposal and the contract within the same flow, tied to the opportunity. Everything connected, with no file lost on WhatsApp.',
      },
      {
        pain: 'You closed the sale, but the work started from scratch',
        solution:
          'The won opportunity becomes a work order with one click, carrying the customer details and what was sold. Sales and the field speak the same language.',
      },
    ],
    deepDives: [
      {
        icon: Users,
        title: 'A kanban sales pipeline, from lead to contract',
        body: 'Capture the lead, log the contact, and move the opportunity through the pipeline stages by dragging it on the kanban board: new, in contact, quote, proposal, closing. Each card shows the customer, the estimated value, the rep in charge, and the history of interactions. You see the whole pipeline and act where the deal is stuck.',
        image: {
          src: '/modulos/crm/1.webp',
          alt: 'Sales team meeting in the office reviewing the pipeline with a growth chart',
        },
      },
      {
        icon: FileSignature,
        title: 'Quote to proposal to contract in the same flow',
        body: 'From the opportunity you build the quote with items, labor, and materials, turn it into a proposal sent by link, and close it as a contract. Everything stays tied to the CRM opportunity, so the rep tracks the approval and nothing gets lost between "let me think about it" and "we have a deal".',
        image: {
          src: '/modulos/crm/2.webp',
          alt: 'Professionals reviewing a contract and proposal on the office table',
        },
      },
      {
        icon: TrendingUp,
        title: 'Direct conversion into a work order',
        body: 'A won deal does not start over from scratch: the opportunity becomes a work order with one click, carrying the customer, the address, and the sold scope out to the field. Sales closes the deal and the operation already has everything to run the job, with no need to retype anything.',
        image: {
          src: '/modulos/crm/3.webp',
          alt: 'Salesperson closing a deal with a customer after signing the documents',
        },
      },
    ],
    featuresHeading: 'From lead to contract, without losing an opportunity',
    featuresSubheading: 'The CRM that speaks the same language as your field operation',
    features: [
      { icon: Users, title: 'Lead capture', desc: 'Log every incoming contact and do not let an opportunity die in the inbox.' },
      { icon: ClipboardList, title: 'Kanban pipeline', desc: 'Move opportunities through the stages by dragging, with value and owner visible.' },
      { icon: UserCircle, title: 'Assign to a rep', desc: 'Every opportunity has an owner and you track each rep\'s performance.' },
      { icon: FileText, title: 'Integrated quotes', desc: 'Build the quote straight from the opportunity, with items and labor.' },
      { icon: Send, title: 'Proposals by link', desc: 'Send the proposal by link and see when the customer opens and approves it.' },
      { icon: FileSignature, title: 'Contracts in the flow', desc: 'Close the deal as a contract within the same CRM path.' },
      { icon: TrendingUp, title: 'Conversion to a work order', desc: 'The won opportunity becomes a work order with one click.' },
      { icon: BarChart3, title: 'Pipeline view', desc: 'Track the pipeline, the conversion rate, and where the deal stalls.' },
    ],
    testimonialsHeading: 'Whoever organized the pipeline closes more',
    testimonials: [
      { quote: 'Leads came in and got lost on WhatsApp. Now every opportunity has an owner and a stage. We stopped leaving money on the table.', name: 'Juliana C.', role: 'Sales Manager', company: 'services company' },
      { quote: 'The quote becomes a proposal and a contract without switching systems. And what closes already becomes a work order.', name: 'Marcelo T.', role: 'Partner', company: 'building maintenance' },
      { quote: 'For the first time I can see the whole pipeline. I know where each deal is and what is left to close.', name: 'Patrícia L.', role: 'Director', company: 'installations and services' },
    ],
    faq: [
      { q: 'What does the Dominex CRM do?', a: 'It organizes your sales operation: it captures leads, builds the sales pipeline on a kanban board, assigns each opportunity to a rep, and takes it from quote to proposal to contract, with direct conversion into a work order.' },
      { q: 'How does the sales pipeline work?', a: 'The pipeline is a kanban with stages (new, in contact, quote, proposal, closing). You drag each opportunity into the right stage and see the customer, the estimated value, and the owner on each card.' },
      { q: 'Can I assign opportunities to reps?', a: 'Yes. Every opportunity has a rep in charge and you track the pipeline and the performance of each one.' },
      { q: 'Does the CRM connect with quotes and contracts?', a: 'Yes. From the opportunity you build the quote, turn it into a proposal sent by link, and close it as a contract, all tied to the opportunity, with no loose files.' },
      { q: 'When I close the sale, do I need to re-enter the customer for the work order?', a: 'No. The won opportunity becomes a work order with one click, carrying the customer, the address, and the sold scope. Sales and the field work with the same data.' },
      { q: 'Can I track the conversion rate?', a: 'Yes. You track the pipeline, see how many opportunities advance by stage, and spot where deals tend to stall.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You add your leads and start organizing the sales pipeline right away.' },
    ],
    finalCta: {
      title: 'Organize your pipeline and close more',
      subtitle: 'Free for 14 days, no credit card. Capture your leads, organize the pipeline, and go from lead to contract.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 4. Financial control
  // ────────────────────────────────────────────────────────────────────────
  'controle-financeiro': {
    slug: 'field-service-financial-software',
    metaTitle: 'Financial Management Software for Service Companies | Dominex',
    metaDescription:
      'Financial management software for service companies: accounts payable and receivable, cash flow, income statement, credit card management, and reconciliation. Know how much comes in, how much goes out, and how much is left. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Finance',
      h1: 'Financial management software for service companies',
      h1Highlight: 'Financial management',
      subtitle:
        'Not sure whether the month closed in the black? Dominex organizes accounts payable and receivable, shows real-time cash flow, and closes the income statement, so you decide with numbers, not guesswork.',
    },
    metrics: [
      { value: 'Payable/receivable', label: 'accounts organized with due dates' },
      { value: 'Cash flow', label: 'money in and out in real time' },
      { value: 'Income statement', label: 'the month\'s result closed automatically' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'Deciding on a hunch costs you the month\'s profit',
    painsSubheading: 'Where the spreadsheet does not tell the truth, Dominex shows the number',
    pains: [
      {
        pain: '"Is there enough money to pay for this?"',
        solution:
          'Cash flow shows, in real time, how much came in, how much will go out, and the projected balance. You decide by looking at the number, not on a fright.',
      },
      {
        pain: 'A forgotten bill turns into interest and penalties',
        solution:
          'Accounts payable and receivable are organized by due date, with alerts for what is coming due. Nothing slips by.',
      },
      {
        pain: 'You do not know if the month made a profit or a loss',
        solution:
          'The income statement closes automatically with categorized revenue, costs, and expenses. You see the month\'s result without building a spreadsheet.',
      },
      {
        pain: 'The credit card bill mixed in with cash and nobody understands the balance',
        solution:
          'The credit card gets its own treatment: the expense enters as forecast and the aggregated bill is what actually becomes a payment. The balance stops lying.',
      },
    ],
    deepDives: [
      {
        icon: CalendarClock,
        title: 'Accounts payable and receivable under control',
        body: 'Enter each account payable and receivable with its due date, category, and customer or supplier. The system organizes them by date, alerts you to what is coming due, and shows what has already been settled. You stop paying interest out of forgetfulness and bill the customer on the right day.',
        image: {
          src: '/modulos/controle-financeiro/1.webp',
          alt: 'Hands using a calculator over a desk with documents and folders, organizing accounts payable and receivable',
        },
      },
      {
        icon: TrendingUp,
        title: 'Cash flow and income statement in real time',
        body: 'Cash flow consolidates money in and out and projects the balance for the coming days. The income statement closes the month with categorized revenue, costs, and expenses, showing the real margin of the business. You decide with numbers in hand, not on a feeling.',
        image: {
          src: '/modulos/controle-financeiro/2.webp',
          alt: 'Professional analyzing financial charts and reports, pointing at the numbers with a pencil',
        },
      },
      {
        icon: CreditCard,
        title: 'Credit card without messing up your cash',
        body: 'In Dominex the credit card expense enters as forecast, and what actually becomes a payment is the aggregated bill, so your account balance never appears lower than it really is. You track the total bill per card and reconcile what was actually spent, without confusing an expense with a payment.',
        image: {
          src: '/modulos/controle-financeiro/3.webp',
          alt: 'Person making a contactless payment with a credit card on a card reader',
        },
      },
    ],
    featuresHeading: 'Your company\'s finances, organized',
    featuresSubheading: 'Know how much comes in, how much goes out, and how much is left',
    features: [
      { icon: CalendarClock, title: 'Accounts payable', desc: 'Due dates organized, with alerts for what is coming due.' },
      { icon: HandCoins, title: 'Accounts receivable', desc: 'Know what each customer owes and bill on the right day.' },
      { icon: TrendingUp, title: 'Cash flow', desc: 'Money in, money out, and the projected balance in real time.' },
      { icon: BarChart3, title: 'Automatic income statement', desc: 'The month\'s result with categorized revenue, costs, and expenses.' },
      { icon: CreditCard, title: 'Card management', desc: 'Forecast expense and aggregated bill, without messing up the balance.' },
      { icon: Receipt, title: 'Categories', desc: 'Classify every entry and see where the money goes.' },
      { icon: Landmark, title: 'Accounts and banks', desc: 'Track the balance of each of the company\'s accounts and cash boxes.' },
      { icon: FileCheck2, title: 'Reconciliation', desc: 'Match what was forecast with what actually came in and out.' },
    ],
    testimonialsHeading: 'Whoever measures decides better',
    testimonials: [
      { quote: 'I used to close the month in a panic. Now I see the cash flow and the income statement and I know if there was a profit before the accountant does.', name: 'Rafael G.', role: 'Partner', company: 'services company' },
      { quote: 'A bill no longer slips by. The system alerts me and I stopped paying interest out of forgetfulness.', name: 'Camila V.', role: 'Finance', company: 'maintenance and installation' },
      { quote: 'The card bill used to mess up my balance. Now the expense is forecast and the bill is what counts. It makes sense.', name: 'Lucas R.', role: 'Administrator', company: 'field services' },
    ],
    faq: [
      { q: 'What does Dominex financial management do?', a: 'It organizes accounts payable and receivable, shows real-time cash flow, closes the month\'s income statement, treats the credit card separately, and helps with reconciliation, so you decide with numbers, not guesswork.' },
      { q: 'How does cash flow work?', a: 'Cash flow consolidates all money in and out and projects the balance for the coming days. You see how much came in, how much will go out, and how much is left, in real time.' },
      { q: 'Does the system generate an income statement?', a: 'Yes. The income statement closes the month automatically with categorized revenue, costs, and expenses, showing the real margin of the business without building a spreadsheet.' },
      { q: 'How does Dominex handle the credit card?', a: 'The card expense enters as forecast (not as a payment), and what actually becomes a payment is the aggregated bill. That way your account balance never appears lower than it really is.' },
      { q: 'Can I control accounts payable and receivable with due dates?', a: 'Yes. Each account has a due date, category, and customer or supplier. The system organizes them by date and alerts you to what is coming due.' },
      { q: 'Can I track the balance of several accounts and cash boxes?', a: 'Yes. You track the balance of each cash box and bank account of the company and reconcile what was forecast with what actually came in and out.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You enter your accounts and see the cash flow and the month\'s result right away.' },
    ],
    finalCta: {
      title: 'Know whether the month closed in the black',
      subtitle: 'Free for 14 days, no credit card. Organize the accounts, see the cash flow, and close the income statement without a spreadsheet.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 5. Time tracking & Payroll (HR)
  // ────────────────────────────────────────────────────────────────────────
  'ponto-e-folha': {
    slug: 'time-tracking-payroll-software',
    metaTitle: 'Time Tracking and Payroll for Field Teams | Dominex',
    metaDescription:
      'Time tracking and payroll for field teams: clock in with a selfie and geolocation, an overtime balance, payroll, advances, and employee management, all in one place. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Time Tracking & Payroll (HR)',
      h1: 'Time tracking and payroll for field teams',
      h1Highlight: 'Time tracking and payroll',
      subtitle:
        'Your team starts the day at the customer, not the office, so a paper time sheet does not cut it. Dominex clocks time with a selfie and location, calculates the overtime balance, and closes payroll with advances deducted.',
    },
    metrics: [
      { value: 'Selfie + GPS', label: 'time clocked from wherever the technician is' },
      { value: 'Overtime balance', label: 'overtime and absences calculated on their own' },
      { value: 'Payroll + advances', label: 'the month closed per employee' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'Tracking the hours of people who live on the road is hard',
    painsSubheading: 'Where the paper time sheet cannot reach, Dominex records',
    pains: [
      {
        pain: 'The technician starts the day at the customer and the time goes unrecorded',
        solution:
          'Time is clocked on the phone, from wherever the employee is, with a selfie and geolocation. You know who clocked in, at what time, and from where.',
      },
      {
        pain: 'The overtime balance calculated by hand, always with errors',
        solution:
          'The system calculates hours worked, overtime, and absences from the clock-ins. The overtime balance closes on its own, with no spreadsheet.',
      },
      {
        pain: 'An advance handed out on the fly and forgotten at payroll close',
        solution:
          'Each advance is recorded and deducted automatically from the paycheck. Payroll closes with the right net amount.',
      },
      {
        pain: 'Employee data scattered across papers and messages',
        solution:
          'The employee record centralizes salary, role, advances, and statement. You see each person\'s financial picture in a single place.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'Clock in with a selfie and geolocation',
        body: 'The employee clocks in, out, and for breaks on their phone, from wherever they are. Each entry saves a selfie and the location, so you can prove who clocked in and from where, ideal for teams that start the day straight at the customer without stopping by the company.',
        image: {
          src: '/modulos/ponto-e-folha/1.webp',
          alt: 'Field worker in safety gear checking a phone on a job site',
        },
      },
      {
        icon: Clock,
        title: 'The overtime balance calculated on its own',
        body: 'From the clock-ins, the system calculates hours worked, overtime, and absences, keeping the overtime balance up to date. At the end of the month you have each employee\'s balance ready, without adding anything up by hand or fighting a spreadsheet.',
        image: {
          src: '/modulos/ponto-e-folha/2.webp',
          alt: 'Manager seated at a desk reviewing information on a clipboard in the office',
        },
      },
      {
        icon: Banknote,
        title: 'Payroll with advances deducted',
        body: 'Payroll close consolidates salary, the overtime balance, and the advances the employee took during the month, deducting them automatically from the net amount. The pay slip and the advance receipt come out ready, and the employee statement shows each entry in and out with the right sign.',
        image: {
          src: '/modulos/ponto-e-folha/3.webp',
          alt: 'Woman counting cash in the office, closing the payroll',
        },
      },
    ],
    featuresHeading: 'The HR of your field operation, in one place',
    featuresSubheading: 'From clocking in on the road to closing payroll',
    features: [
      { icon: Smartphone, title: 'Clock in by phone', desc: 'Clock in, out, and for breaks from wherever the employee is.' },
      { icon: Camera, title: 'Selfie on the entry', desc: 'Each entry saves a selfie, proving who clocked in.' },
      { icon: MapPin, title: 'Geolocation', desc: 'The location of the clock-in is recorded with the entry.' },
      { icon: Clock, title: 'Overtime balance', desc: 'Overtime and absences calculated from the clock-ins, with no spreadsheet.' },
      { icon: Banknote, title: 'Payroll', desc: 'Close per employee with the pay slip ready.' },
      { icon: HandCoins, title: 'Advances deducted', desc: 'Each recorded advance is deducted from the paycheck.' },
      { icon: Users, title: 'Employee records', desc: 'Salary, role, advances, and statement centralized per person.' },
      { icon: FileText, title: 'Employee statement', desc: 'Entries in and out on cards, with the right sign on each one.' },
    ],
    testimonialsHeading: 'Whoever controls the hours closes payroll in peace',
    testimonials: [
      { quote: 'My team starts the day at the customer. With selfie and GPS clock-in, I know who started and from where, with no paper.', name: 'Diego F.', role: 'Manager', company: 'field services' },
      { quote: 'The overtime balance was a monthly headache. Now it closes on its own from the clock-ins.', name: 'Aline R.', role: 'HR', company: 'building maintenance' },
      { quote: 'We used to hand out advances and forget them at close. Now they are deducted automatically on payroll. The net comes out right.', name: 'Thiago P.', role: 'Administrator', company: 'electrical installations' },
    ],
    faq: [
      { q: 'How does the Dominex time clock work?', a: 'The employee clocks in, out, and for breaks on their phone, from wherever they are, with a selfie and geolocation on each entry. Ideal for field teams that start the day straight at the customer.' },
      { q: 'Does the clock prove who clocked in and from where?', a: 'Yes. Each entry saves a selfie of the employee and the location, giving proof of who clocked in and where.' },
      { q: 'Is the overtime balance calculated automatically?', a: 'Yes. From the clock-ins, the system calculates hours worked, overtime, and absences, keeping the overtime balance up to date with no spreadsheet.' },
      { q: 'Can I close payroll in the system?', a: 'Yes. The close consolidates salary, the overtime balance, and advances, deducting the advances automatically. The pay slip comes out ready.' },
      { q: 'How do advances work?', a: 'Each advance is recorded and deducted automatically from the paycheck. The employee statement shows each entry in and out with the right sign.' },
      { q: 'Where is employee data kept?', a: 'In the employee record, which centralizes salary, role, advances, and statement. You see each person\'s financial picture in a single place.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You register the team and start clocking time and closing payroll right away.' },
    ],
    finalCta: {
      title: 'Control the hours of people who live on the road',
      subtitle: 'Free for 14 days, no credit card. Clock time with a selfie and location and close payroll without a spreadsheet.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 6. Electronic service invoicing
  // ────────────────────────────────────────────────────────────────────────
  'emissao-de-nfse': {
    slug: 'service-invoice-software',
    metaTitle: 'Electronic Service Invoicing Software for Service Companies | Dominex',
    metaDescription:
      'Electronic service invoicing software for service companies: issue the service invoice per customer straight from the platform, with the customer data pulled automatically. No separate billing software. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Service Invoicing',
      h1: 'Electronic service invoicing software for service companies',
      h1Highlight: 'service invoicing',
      subtitle:
        'You did the job and still have to open another system to issue the invoice? Dominex issues the electronic service invoice per customer, without leaving the platform where you already work.',
    },
    metrics: [
      { value: 'Invoicing', label: 'the service invoice issued on the platform' },
      { value: 'Per customer', label: 'issuance tied to the customer record' },
      { value: 'Integrated', label: 'billing where you manage the operation' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'The invoice cannot be a separate system',
    painsSubheading: 'Where the standalone issuer gets in the way, Dominex integrates',
    pains: [
      {
        pain: 'Issuing invoices in another system, with another login and password',
        solution:
          'The service invoice is issued inside Dominex, per customer, without opening a separate issuer or retyping data. Less screen switching, fewer errors.',
      },
      {
        pain: 'Customer data typed again just for the invoice',
        solution:
          'Issuance pulls the data from the customer record you already have on the platform. You select the customer and issue.',
      },
      {
        pain: 'Invoicing scattered across tools that do not talk to your operation',
        solution:
          'Billing lives on the same platform as your customers and services, so what you invoice always matches the work you delivered.',
      },
      {
        pain: 'Invoice issued and lost, with no control over what has been billed',
        solution:
          'The invoices are recorded and organized by customer, with what has already been issued. You track billing without digging through email.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'The invoice issued without leaving the platform',
        body: 'The electronic service invoice is issued from inside Dominex, on the same platform where you manage customers and services. You select the customer, check the data already in the record, and issue, with no standalone issuer, no other login, and nothing retyped.',
        image: {
          src: '/modulos/emissao-de-nfse/1.webp',
          alt: 'Person organizing documents and using a laptop on an office desk',
        },
      },
      {
        icon: Building2,
        title: 'Billing that matches the work you delivered',
        body: 'Because the invoice is issued from the same record as your customers and work orders, what you bill always lines up with the service you delivered. You select the customer, confirm the amounts, and issue, keeping invoicing and operations perfectly in sync.',
        image: {
          src: '/modulos/emissao-de-nfse/2.webp',
          alt: 'Professional reviewing invoicing documents and forms on a wooden desk',
        },
      },
      {
        icon: Receipt,
        title: 'Issuance per customer, with an organized history',
        body: 'Each invoice is issued from the customer record and stays in the history, organized by who was billed. You track what has already been issued, avoid duplicate invoices, and keep control of your billing without relying on a spreadsheet or your inbox.',
        image: {
          src: '/modulos/emissao-de-nfse/3.webp',
          alt: 'Person handling and organizing paper receipts and invoices, keeping the history in order',
        },
      },
    ],
    featuresHeading: 'Service invoicing, with no separate system',
    featuresSubheading: 'The invoice where you already manage the operation',
    features: [
      { icon: FileText, title: 'Invoice issuance', desc: 'Issue the service invoice straight on the platform, with no standalone issuer.' },
      { icon: UserCircle, title: 'Issuance per customer', desc: 'The invoice pulls data from the customer record you already have.' },
      { icon: Building2, title: 'Integrated billing', desc: 'Invoicing lives on the same platform as your customers and services.' },
      { icon: CheckSquare, title: 'Data check', desc: 'Before issuing, the system confirms the amounts and the customer data.' },
      { icon: Receipt, title: 'History per customer', desc: 'Track the invoices issued, organized by who was billed.' },
      { icon: ShieldCheck, title: 'Consistent standard', desc: 'Adherence to a consistent standard for every service invoice you issue.' },
      { icon: BarChart3, title: 'Billing control', desc: 'See what has already been issued and keep billing under control.' },
      { icon: FileCheck2, title: 'Ready document', desc: 'The issued invoice is available to send to the customer.' },
    ],
    testimonialsHeading: 'Whoever integrated the invoice saved time',
    testimonials: [
      { quote: 'I used to issue the invoice in another system, with another login. Now I issue it straight in Dominex, from the customer record.', name: 'Rodrigo A.', role: 'Partner', company: 'services company' },
      { quote: 'I stopped retyping customer data just for the invoice. I select the customer and issue the invoice.', name: 'Fábio M.', role: 'Administrator', company: 'maintenance and installation' },
      { quote: 'Having billing on the same platform as the jobs means what I invoice always matches what I delivered.', name: 'Bruno S.', role: 'Owner', company: 'field services' },
    ],
    faq: [
      { q: 'What is electronic service invoicing?', a: 'It is the digital issuance of the service invoice, the billing document for service providers. Dominex issues the electronic service invoice, aimed at service companies, straight from the platform where you already manage customers and jobs.' },
      { q: 'Do I need another system to issue the invoice?', a: 'No. The invoice is issued from inside Dominex, per customer, without opening a standalone issuer or using another login. You select the customer and issue on the same platform where you already work.' },
      { q: 'Does invoicing stay in sync with my jobs?', a: 'Yes. Because the invoice is issued from the same record as your customers and work orders, what you bill always lines up with the service you delivered, with no double entry.' },
      { q: 'Does the invoice pull customer data automatically?', a: 'Yes. Issuance uses the data from the customer record you already have on the platform, with nothing retyped.' },
      { q: 'Can I track the invoices I have issued?', a: 'Yes. The invoices are recorded and organized by customer, with a history of what has already been issued, helping you control billing and avoid duplicates.' },
      { q: 'Can I send the invoice to the customer?', a: 'Yes. Once issued, the invoice is available on the customer record and ready to send, so the customer receives the billing document without any manual rework.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You enable the invoicing module and issue the service invoice from the customer record.' },
    ],
    finalCta: {
      title: 'Issue the service invoice where you already work',
      subtitle: 'Free for 14 days, no credit card. Issue the service invoice per customer, with no separate system.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 7. Customer portal
  // ────────────────────────────────────────────────────────────────────────
  'portal-do-cliente': {
    slug: 'customer-portal-software',
    metaTitle: 'Customer Portal for Service Companies | Dominex',
    metaDescription:
      'Customer portal for service companies: your customer tracks the work order, sees the service history, accesses documents, and approves the quote by link, without having to call the office. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Customer Portal',
      h1: 'Customer portal for service companies',
      h1Highlight: 'Customer portal',
      subtitle:
        'Does your customer call every hour to ask if the technician has arrived? With the Customer Portal, they track the work order, see the history, access the documents, and approve the quote by link, on their own.',
    },
    metrics: [
      { value: 'By link', label: 'the customer accesses without installing anything' },
      { value: 'Tracks the work order', label: 'status and history in real time' },
      { value: 'Approves the quote', label: 'no phone call, no lost email' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'The phone rings all day with the same question',
    painsSubheading: 'Where the customer has to call to find out, the portal shows on its own',
    pains: [
      {
        pain: '"Has the technician gone yet? Is it fixed?"',
        solution:
          'The customer opens the portal by link and sees the work order status in real time, scheduled, in progress, completed. The phone stops ringing over the same thing.',
      },
      {
        pain: 'The customer asks for the service history and nobody can find it',
        solution:
          'The portal shows the customer\'s full work order history, with dates and what was done. They check it on their own, without contacting the office.',
      },
      {
        pain: 'A quote approved by a message that gets lost on WhatsApp',
        solution:
          'The customer approves the quote straight in the portal, with a record of when they approved. No "send it again", no approval that gets lost.',
      },
      {
        pain: 'Reports and documents sent and lost in email',
        solution:
          'Work order reports and documents stay available in the portal for the customer to access at any time, with no resending.',
      },
    ],
    deepDives: [
      {
        icon: Eye,
        title: 'The customer tracks the work order on their own',
        body: 'Through the Customer Portal, accessed by a link (no app to install), the customer sees where the work order stands: scheduled, technician on the way, in progress, completed. They follow the job in real time and stop calling the office every hour, giving your team the quiet they need to work.',
        image: {
          src: '/modulos/portal-do-cliente/1.webp',
          alt: 'Customer smiling while following the service on a phone at home',
        },
      },
      {
        icon: BookOpen,
        title: 'History and documents always at hand',
        body: 'The customer\'s full service history lives in the portal: past work orders, dates, what was done, and the PDF reports. The documents stay available for reference at any time, so the customer never has to ask "send me that report again", it is all there.',
        image: {
          src: '/modulos/portal-do-cliente/2.webp',
          alt: 'Hands reviewing printed documents next to a laptop on the desk',
        },
      },
      {
        icon: CheckSquare,
        title: 'Quote approval by link',
        body: 'The quote reaches the customer by link and they approve it straight in the portal, with a record of when they approved. The approval does not get lost on WhatsApp or in email, and what was approved moves on to become a work order, closing the loop from sales to execution with no friction.',
        image: {
          src: '/modulos/portal-do-cliente/3.webp',
          alt: 'Man smiling while approving something on a laptop',
        },
      },
    ],
    featuresHeading: 'Autonomy for the customer, quiet for you',
    featuresSubheading: 'The customer solves on their own what today turns into a phone call',
    features: [
      { icon: Eye, title: 'Work order tracking', desc: 'The customer sees the work order status in real time.' },
      { icon: BookOpen, title: 'Service history', desc: 'All past work orders, with dates and what was done.' },
      { icon: FileText, title: 'Document access', desc: 'Reports and documents available for reference at any time.' },
      { icon: CheckSquare, title: 'Quote approval', desc: 'The customer approves the quote by link, with a record.' },
      { icon: Send, title: 'Access by link', desc: 'No app to install: the customer enters through a link.' },
      { icon: UserCircle, title: 'Your company\'s identity', desc: 'The portal can carry your logo and colors, on the White Label plan.' },
      { icon: BarChart3, title: 'Fewer phone calls', desc: 'The customer checks on their own what today becomes a call.' },
      { icon: ShieldCheck, title: 'Each one sees only their own', desc: 'The customer accesses only their own jobs and documents.' },
    ],
    testimonialsHeading: 'Whoever opened the portal stopped taking the same call',
    testimonials: [
      { quote: 'The customer called all day to ask if the technician was coming. Now they follow it in the portal and we work in peace.', name: 'Juliana C.', role: 'Customer Service', company: 'services company' },
      { quote: 'Quote approvals used to vanish on WhatsApp. In the portal, they approve and it stays on record.', name: 'Marcelo T.', role: 'Partner', company: 'building maintenance' },
      { quote: 'The service history in the portal gave the customer autonomy. They check it without needing us.', name: 'Patrícia L.', role: 'Manager', company: 'installations and services' },
    ],
    faq: [
      { q: 'What is the Customer Portal?', a: 'It is an area where your customer tracks work orders, sees the service history, accesses documents, and approves quotes, on their own, without calling the office.' },
      { q: 'Does the customer need to install an app?', a: 'No. Access is by link: the customer opens it in the browser and sees the work order status, the history, and the documents.' },
      { q: 'Can the customer track the work order in real time?', a: 'Yes. They see the work order status (scheduled, in progress, completed) in real time, which drastically reduces phone calls to the office.' },
      { q: 'Can the customer approve a quote through the portal?', a: 'Yes. The quote arrives by link and the customer approves it straight in the portal, with a record of when they approved. The approval does not get lost on WhatsApp.' },
      { q: 'Does the customer see the service history and documents?', a: 'Yes. The full work order history, with dates and what was done, plus reports and documents, stays available in the portal for reference at any time.' },
      { q: 'Does each customer see only their own data?', a: 'Yes. In the portal, each customer accesses only their own jobs and documents.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You enable the portal and share the link with your customers.' },
    ],
    finalCta: {
      title: 'Give the customer autonomy and your team some quiet',
      subtitle: 'Free for 14 days, no credit card. Let the customer track the work order and approve the quote on their own.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 8. Inventory
  // ────────────────────────────────────────────────────────────────────────
  'controle-de-estoque': {
    slug: 'inventory-management-software',
    metaTitle: 'Inventory Management Software for Field Teams | Dominex',
    metaDescription:
      'Inventory management software for field teams: register parts and materials, log stock in and out, deduct automatically per work order, and run inventory counts. Know what you have, what went out, and on which work order. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Inventory',
      h1: 'Inventory management software for field teams',
      h1Highlight: 'Inventory management',
      subtitle:
        'The part ran out right when the job needed it and nobody noticed? Dominex tracks parts and materials, deducts automatically on every work order, and shows what you really have in stock.',
    },
    metrics: [
      { value: 'Stock in/out', label: 'part movements under control' },
      { value: 'Deduct per work order', label: 'consumption logged on the work order' },
      { value: 'Inventory count', label: 'the real balance checked whenever you want' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'Stock in the dark stalls the job',
    painsSubheading: 'Where the part goes missing with no record, Dominex deducts it right',
    pains: [
      {
        pain: 'The technician arrives at the customer and the part was out of stock',
        solution:
          'The balance of each part stays up to date with every stock in and out. You know what you have before you send the technician, with no surprise on the job.',
      },
      {
        pain: 'Material used on the work order and nobody deducted it',
        solution:
          'Consumption is logged on the work order itself and stock is deducted automatically. You know what went out and on which job.',
      },
      {
        pain: 'You do not know how much material each job used',
        solution:
          'Because the deduction is tied to the work order, you can see the material cost per job. The next job\'s quote gets more accurate.',
      },
      {
        pain: 'You only discover the shortfall after the part runs out',
        solution:
          'Run an inventory count whenever you want and adjust the real balance. The system shows the discrepancy and keeps stock reliable.',
      },
    ],
    deepDives: [
      {
        icon: Package,
        title: 'Parts and materials with an always up-to-date balance',
        body: 'Register each part and material with a code, unit, and quantity. Every stock in (purchase, restock) and every stock out (use, loss) updates the balance instantly. You check stock and see what you really have, avoiding sending the technician to a job without the part they need.',
        image: {
          src: '/modulos/controle-de-estoque/1.webp',
          alt: 'Labeled shelves with numbered dividers in a warehouse',
        },
      },
      {
        icon: PackageMinus,
        title: 'Automatic deduction per work order',
        body: 'The material used on the job is logged on the work order itself and stock is deducted on its own. This ties consumption to the work order: you know what went out, on which job, and for which customer, and you can even see the material cost per job, making the next quotes more accurate.',
        image: {
          src: '/modulos/controle-de-estoque/2.webp',
          alt: 'Warehouse worker logging items with a scanner and tablet',
        },
      },
      {
        icon: ClipboardList,
        title: 'Inventory counts to keep the balance reliable',
        body: 'When you need to, run an inventory count: check the physical count against the system balance and adjust the discrepancy. Stock goes back to reflecting reality, and you catch a shortfall or loss before it disrupts the next job, not after the part ran out at the customer.',
        image: {
          src: '/modulos/controle-de-estoque/3.webp',
          alt: 'Warehouse worker checking the inventory count with a tablet',
        },
      },
    ],
    featuresHeading: 'The stock that talks to the field',
    featuresSubheading: 'Know what you have, what went out, and on which work order',
    features: [
      { icon: Package, title: 'Parts registry', desc: 'Parts and materials with a code, unit, and quantity.' },
      { icon: TrendingUp, title: 'Stock in', desc: 'Log purchases and restocks and update the balance instantly.' },
      { icon: PackageMinus, title: 'Stock out', desc: 'Log use and loss, with the balance always right.' },
      { icon: ClipboardList, title: 'Deduct per work order', desc: 'Consumption is logged on the work order and deducted automatically.' },
      { icon: Receipt, title: 'Material cost per work order', desc: 'See how much material each job consumed.' },
      { icon: CheckSquare, title: 'Inventory count', desc: 'Check the physical count and adjust the discrepancy whenever you want.' },
      { icon: ShieldCheck, title: 'Reliable balance', desc: 'Stock reflects reality, with no hidden shortfall.' },
      { icon: BarChart3, title: 'What is running low', desc: 'See the parts with a low balance before they run out.' },
    ],
    testimonialsHeading: 'Whoever controlled the stock stopped missing jobs',
    testimonials: [
      { quote: 'The technician arrived at the customer and the part had run out. Now the balance is right and we restock before it runs low.', name: 'Rafael G.', role: 'Partner', company: 'maintenance and installation' },
      { quote: 'Material went out and nobody deducted it. Now it is deducted on the work order, automatically. I know what went out and on which job.', name: 'Camila V.', role: 'Warehouse', company: 'field services' },
      { quote: 'Because the deduction is on the work order, I can see the material cost per job. The quote got more accurate.', name: 'Lucas R.', role: 'Manager', company: 'services company' },
    ],
    faq: [
      { q: 'What does Dominex inventory management do?', a: 'It registers parts and materials, logs stock in and out, deducts automatically per work order, and allows inventory counts, so you know what you have, what went out, and on which job.' },
      { q: 'Does the stock deduction happen automatically?', a: 'Yes. The material used is logged on the work order itself and stock is deducted on its own, tying consumption to the work order and the customer.' },
      { q: 'Can I know the material cost per job?', a: 'Yes. Because the deduction is tied to the work order, you can see how much material each job consumed, making the next quotes more accurate.' },
      { q: 'How does the inventory count work?', a: 'You run the physical count whenever you want, compare it with the system balance, and adjust the discrepancy. Stock goes back to reflecting reality.' },
      { q: 'Is the balance updated in real time?', a: 'Yes. Every stock in and out updates the balance instantly, so you check stock and see what you really have.' },
      { q: 'Can I see the parts that are running out?', a: 'Yes. You see the parts with a low balance and restock before they run out on the job.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You register your parts and start controlling stock in, stock out, and deductions per work order.' },
    ],
    finalCta: {
      title: 'Stop missing jobs for lack of a part',
      subtitle: 'Free for 14 days, no credit card. Control your stock and deduct automatically on every work order.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 9. Quotes & Contracts
  // ────────────────────────────────────────────────────────────────────────
  'orcamentos-e-contratos': {
    slug: 'quotes-contracts-software',
    metaTitle: 'Quotes and Contracts Software for Service Companies | Dominex',
    metaDescription:
      'Quotes and contracts software for service companies: build professional quotes, send them as a proposal by link, close recurring contracts that generate work orders on their own, and turn approval into a work order. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Quotes & Contracts',
      h1: 'Quotes and contracts software for service companies',
      h1Highlight: 'Quotes and contracts',
      subtitle:
        'Quotes done off the top of your head and contracts forgotten until the customer complains? Dominex builds professional quotes, turns them into a proposal by link, and closes recurring contracts that generate the work orders on their own.',
    },
    metrics: [
      { value: 'Proposal by link', label: 'the customer approves from anywhere' },
      { value: 'Recurring', label: 'a contract that generates the work orders on its own' },
      { value: 'Approved to work order', label: 'the quote becomes a work order' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'Improvised quotes and contracts stall your revenue',
    painsSubheading: 'Where there is no standard, Dominex makes it professional and automatic',
    pains: [
      {
        pain: 'A quote done off the top of your head, with no standard and no trail',
        solution:
          'Build quotes with items, labor, and materials in a professional, branded template. Each quote is recorded and linked to the customer.',
      },
      {
        pain: 'A proposal sent by message and approved with an "ok" that disappears',
        solution:
          'The proposal goes by link and the customer approves with a record of when they approved. You see who opened it and who closed.',
      },
      {
        pain: 'A preventive maintenance contract forgotten until the customer asks',
        solution:
          'Recurring contracts (monthly, quarterly) generate the work orders on their own at the right interval. You never miss an SLA out of forgetfulness again.',
      },
      {
        pain: 'You closed the job and the work started from scratch',
        solution:
          'The approved quote becomes a work order with one click, carrying the scope out to the field. Sales and operations work with the same data.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'A professional quote with your branding',
        body: 'Build the quote with items, labor, and materials, organized in a document with your logo and colors. The quote is linked to the customer and the opportunity, with the calculated value, terms, and validity. You project a professional image and stop losing sales to quotes done on the fly.',
        image: {
          src: '/modulos/orcamentos-e-contratos/1.webp',
          alt: 'Professional writing and building a quote on a desk',
        },
      },
      {
        icon: Send,
        title: 'Proposal by link, approval on record',
        body: 'The quote becomes a proposal sent by link: the customer opens it on their phone, reviews it, and approves, with a record of when they approved. You track the status (sent, viewed, approved) and stop relying on the "ok" on WhatsApp that disappears. The approval is documented, ready to become a contract or a work order.',
        image: {
          src: '/modulos/orcamentos-e-contratos/2.webp',
          alt: 'Person smiling while approving a proposal on a phone',
        },
      },
      {
        icon: Repeat,
        title: 'Recurring contracts that generate the work orders on their own',
        body: 'For preventive maintenance and periodic service, register the contract with the right recurrence (monthly, bimonthly, quarterly). Dominex generates the work orders automatically at the agreed interval, already with the contract scope. Recurring revenue runs without depending on anyone\'s memory and no SLA gets missed.',
        image: {
          src: '/modulos/orcamentos-e-contratos/3.webp',
          alt: 'Hand signing a contract with a pen on a wooden desk',
        },
      },
    ],
    featuresHeading: 'From quote to contract, without losing a sale',
    featuresSubheading: 'Make the proposal professional and automate the recurrence',
    features: [
      { icon: FileText, title: 'Professional quotes', desc: 'Items, labor, and materials in a document with your branding.' },
      { icon: Send, title: 'Proposal by link', desc: 'Send by link and see when the customer opens and approves it.' },
      { icon: CheckSquare, title: 'Approval on record', desc: 'The customer\'s approval is documented, with a date.' },
      { icon: FileSignature, title: 'Contracts', desc: 'Close the deal as a contract linked to the customer.' },
      { icon: Repeat, title: 'Automatic recurrence', desc: 'Contracts that generate the work orders on their own at the right interval.' },
      { icon: TrendingUp, title: 'Conversion to a work order', desc: 'The approved quote becomes a work order with one click.' },
      { icon: UserCircle, title: 'Linked to the customer', desc: 'Each quote and contract stays in the customer\'s history.' },
      { icon: BarChart3, title: 'Tracking', desc: 'See proposals sent, viewed, and approved on one dashboard.' },
    ],
    testimonialsHeading: 'Whoever standardized the proposal closes more',
    testimonials: [
      { quote: 'My quote was a text on WhatsApp. Now it is a document with my branding, and the customer approves by link.', name: 'Diego F.', role: 'Partner', company: 'installations and services' },
      { quote: 'The preventive contract generated work orders off the top of my head. Now the system generates them on its own at the right interval. No more missed SLA.', name: 'Aline R.', role: 'Coordinator', company: 'building maintenance' },
      { quote: 'They approved the proposal, it became a work order with one click. The field already gets the scope ready.', name: 'Thiago P.', role: 'Manager', company: 'field services' },
    ],
    faq: [
      { q: 'How do quotes work in Dominex?', a: 'You build quotes with items, labor, and materials in a professional document with your branding, linked to the customer. The quote is recorded and can become a proposal, a contract, or a work order.' },
      { q: 'Does the customer approve the proposal by link?', a: 'Yes. The proposal goes by link, the customer opens it on their phone and approves with a record of when they approved. You see who opened it and who closed, without relying on the "ok" on WhatsApp.' },
      { q: 'What are recurring contracts?', a: 'They are preventive maintenance or periodic service contracts with a configurable recurrence (monthly, bimonthly, quarterly). Dominex generates the work orders automatically at the right interval, with the contract scope ready.' },
      { q: 'Do the contracts generate work orders on their own?', a: 'Yes. Once the contract is set up with the recurrence, the work orders are generated by the system at the agreed interval, with no need to remember, so no SLA gets missed out of forgetfulness.' },
      { q: 'Does the approved quote become a work order?', a: 'Yes. With one click, the approved quote becomes a work order, carrying the sold scope out to the field. Sales and operations work with the same data.' },
      { q: 'Do the quotes and contracts stay linked to the customer?', a: 'Yes. Each quote and contract stays in the customer\'s history, organized, for reference and tracking.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You build your first quote and send the proposal by link right away.' },
    ],
    finalCta: {
      title: 'Make the proposal professional and automate the contract',
      subtitle: 'Free for 14 days, no credit card. Build branded quotes and let the contract generate the work orders on its own.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 10. Team GPS tracking & Scheduling
  // ────────────────────────────────────────────────────────────────────────
  'rastreamento-de-equipes': {
    slug: 'team-gps-tracking-software',
    metaTitle: 'Team GPS Tracking and Scheduling for Field Services | Dominex',
    metaDescription:
      'Team GPS tracking and scheduling for field services: real-time location on the map, scheduling and routing, check-in and check-out validated by address, and travel history. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'GPS Tracking & Scheduling',
      h1: 'Team GPS tracking and scheduling for field services',
      h1Highlight: 'Team GPS tracking',
      subtitle:
        'Always calling to find out where each technician is? Dominex shows your team on the map in real time, organizes the day\'s schedule, and validates check-in by the customer\'s address.',
    },
    metrics: [
      { value: 'Real time', label: 'your team on the map while they work' },
      { value: 'Check-in/out', label: 'validated by the customer\'s address' },
      { value: 'Schedule', label: 'the day\'s route organized per technician' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'Not knowing where your team is costs you dearly',
    painsSubheading: 'Where the phone goes unanswered, the map shows',
    pains: [
      {
        pain: '"Where is the technician now? Have they reached the customer?"',
        solution:
          'The live map shows where each technician is while they work. You follow the team without making calls.',
      },
      {
        pain: 'The day\'s schedule in your head and the technician crossing town for nothing',
        solution:
          'The schedule organizes the day\'s jobs and helps with routing, assigning to the nearest technician. Less travel, more service.',
      },
      {
        pain: '"Did they really go to the customer?"',
        solution:
          'Check-in and check-out are validated by the customer\'s address, with the time recorded. You have proof of presence on the visit.',
      },
      {
        pain: 'No travel history to check the route',
        solution:
          'The travel history keeps the day\'s key points. You check where the team went and justify the time spent in the field.',
      },
    ],
    deepDives: [
      {
        icon: Navigation,
        title: 'Your team on the map in real time',
        body: 'The live map shows where each technician is while the team works. You follow the field operation from one place, know who is near the next job, and stop calling to ask for a location. Visibility of the whole day is on the screen, not on the phone.',
        image: {
          src: '/modulos/rastreamento-de-equipes/1.webp',
          alt: 'A fleet of service vans lined up, the field team followed as on a live map',
        },
      },
      {
        icon: Calendar,
        title: 'The day\'s schedule and routing',
        body: 'Build the day\'s schedule with each technician\'s jobs and organize the route to cut down on travel. Assign the job to the technician nearest the address and avoid scheduling clashes. Less time in traffic means more jobs per day and customers with a more predictable window.',
        image: {
          src: '/modulos/rastreamento-de-equipes/2.webp',
          alt: 'Driver using GPS navigation in the car to follow the day\'s route',
        },
      },
      {
        icon: MapPin,
        title: 'Validated check-in/out and travel history',
        body: 'The technician checks in and out on the visit, validated by the customer\'s address, with the time recorded, proving their presence on the job. The travel history keeps the key points of the route, so you check where the team went and justify the time spent in the field.',
        image: {
          src: '/modulos/rastreamento-de-equipes/3.webp',
          alt: 'Technician stepping out of the service van on arrival at the customer\'s address for check-in',
        },
      },
    ],
    featuresHeading: 'See your field operation, do not guess it',
    featuresSubheading: 'Location, scheduling, and proof of presence in one place',
    features: [
      { icon: Navigation, title: 'Live map', desc: 'The team\'s location in real time while they work.' },
      { icon: Calendar, title: 'Day\'s schedule', desc: 'Jobs organized per technician, with no scheduling clashes.' },
      { icon: RouteIcon, title: 'Routing', desc: 'Assign the job to the nearest technician and cut down on travel.' },
      { icon: MapPin, title: 'Validated check-in', desc: 'Arrival on the visit validated by the customer\'s address.' },
      { icon: CheckSquare, title: 'Recorded check-out', desc: 'Departure with the time, proving the time on the job.' },
      { icon: BookOpen, title: 'Travel history', desc: 'Key points of the route kept for review.' },
      { icon: Clock, title: 'Time in the field', desc: 'Justify the time spent on each visit with data, not guesses.' },
      { icon: BarChart3, title: 'Productivity', desc: 'Track jobs per technician and per day.' },
    ],
    testimonialsHeading: 'Whoever sees the team on the map stopped calling',
    testimonials: [
      { quote: 'I kept calling to find out where each technician was. Now I see them all on the map and organize the day\'s route.', name: 'Rodrigo A.', role: 'Operations Manager', company: 'field services' },
      { quote: 'Check-in by the customer\'s address ended the doubt over whether the technician really went. I have the proof.', name: 'Fábio M.', role: 'Coordinator', company: 'building maintenance' },
      { quote: 'With scheduling and routing, the team does more jobs per day and crosses town for nothing less often.', name: 'Bruno S.', role: 'Partner', company: 'installations and services' },
    ],
    faq: [
      { q: 'Does Dominex show where my team is in real time?', a: 'Yes. The live map shows where each technician is while they work, so you follow the field operation without making calls.' },
      { q: 'How do scheduling and routing work?', a: 'The schedule organizes the day\'s jobs per technician and helps with routing, assigning the job to the technician nearest the address, cutting down on travel and avoiding scheduling clashes.' },
      { q: 'Does check-in prove the technician went to the customer?', a: 'Yes. Check-in and check-out are validated by the customer\'s address, with the time recorded, proving presence on the visit and the time on the job.' },
      { q: 'Is there a travel history?', a: 'Yes. The history keeps the key points of the day\'s route, so you check where the team went and justify the time in the field.' },
      { q: 'Does routing help do more jobs per day?', a: 'Yes. By assigning to the nearest technician and organizing the route, the team crosses town for nothing less often and serves more customers on the same day.' },
      { q: 'Does the customer get a predictable time?', a: 'Yes. With an organized schedule, you give the customer a more predictable service window and reduce missed visits.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. You register the team and follow the live map and the day\'s schedule right away.' },
    ],
    finalCta: {
      title: 'See your field team on the map',
      subtitle: 'Free for 14 days, no credit card. Follow the team in real time, organize the schedule, and prove every visit.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 11. Technician App (Área do Técnico™)
  // ────────────────────────────────────────────────────────────────────────
  'area-do-tecnico': {
    slug: 'field-technician-app',
    metaTitle: 'Field Technician App: your team\'s field app | Dominex',
    metaDescription:
      'The Technician App: your team\'s field app. Work orders on the phone, technical tools (refrigerant charge, superheat, contactor sizing), an equipment catalog, and an installable app on the phone. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'Technician App',
      h1: 'The Technician App: your team\'s field app',
      h1Highlight: 'Technician App',
      subtitle:
        'The technician does not work sitting at the office, they need everything on their phone. The Technician App is an installable app that brings the work order, the calculation tools, and the catalog to the palm of their hand, out in the field.',
    },
    metrics: [
      { value: 'PWA', label: 'installable app on the technician\'s phone' },
      { value: 'Tools', label: 'technical calculations in the team\'s pocket' },
      { value: 'In their pocket', label: 'everything on the technician\'s phone, in the field' },
      { value: '4.9/5', label: 'satisfaction among the companies that use it' },
    ],
    painsHeading: 'The technician needs everything in the field, not at the office',
    painsSubheading: 'Where the team works without a tool in hand, the Technician App delivers',
    pains: [
      {
        pain: 'The technician opens the work order on their phone and half the information is missing',
        solution:
          'In the Technician App, the work order arrives complete: customer, address, equipment, history, and checklist. They run it from the phone, without calling the office.',
      },
      {
        pain: 'Refrigerant charge and superheat calculated in the head, with a risk of error',
        solution:
          'The technical tools bring refrigerant charge, superheat, and pressure-by-temperature tables to their pocket. Fewer errors, more precision in the field.',
      },
      {
        pain: 'Sizing a contactor on the fly, with no reference',
        solution:
          'Contactor and thermal relay sizing is right in the tool, step by step. The technician calculates it right on the spot.',
      },
      {
        pain: 'The technician carries printed manuals and tables to look things up at the customer',
        solution:
          'The equipment catalog, with photos and manuals, lives on the technician\'s phone. They check the model and the spec on the spot, in the field, with no paper and no call to the office.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'The field app (PWA) with the work order in the palm of your hand',
        body: 'The Technician App is an installable app on the phone (PWA), with no app store. The technician sees the day\'s queue, opens the complete work order, customer, address on a map, equipment, and history, runs the checklist, takes photos, collects the signature, and closes the job. All from the field, without going back to the office.',
        image: {
          src: '/modulos/area-do-tecnico/1.webp',
          alt: 'Technician in coveralls using a phone in the field to open the work order',
        },
      },
      {
        icon: Calculator,
        title: 'Technical tools in the technician\'s pocket',
        body: 'The team carries the day-to-day calculators on their phone: charge and pressure-by-temperature curves for refrigerant gases, superheat calculation, contactor and thermal relay sizing (with direct-on-line start), and an equipment catalog with photos and manuals. The calculation comes out right on the spot, in the field, without relying on memory or a spreadsheet.',
        image: {
          src: '/modulos/area-do-tecnico/2.webp',
          alt: 'HVAC technician using a manifold gauge and tools on an air conditioner',
        },
      },
      {
        icon: Download,
        title: 'Installable app on the phone, with no app store',
        body: 'The Technician App is an installable app (PWA): the technician adds it to their phone straight from the browser, without going through an app store, and opens it like any other app, light and fast. The work order, the calculation tools, and the catalog stay in the palm of their hand, ready to use at the customer, in the field.',
        image: {
          src: '/modulos/area-do-tecnico/3.webp',
          alt: 'Professional wearing a hard hat checking the app on a tablet at the work site',
        },
      },
    ],
    featuresHeading: 'The whole field on the technician\'s phone',
    featuresSubheading: 'Work orders, tools, and catalog in the palm of your hand, in the field',
    features: [
      { icon: Smartphone, title: 'Installable PWA', desc: 'Installs on the phone with no app store, light and fast.' },
      { icon: ClipboardList, title: 'Work orders on the phone', desc: 'The complete work order, with checklist, photos, and signature.' },
      { icon: Gauge, title: 'Refrigerant charge', desc: 'Charge and pressure-by-temperature curves for refrigerants.' },
      { icon: Calculator, title: 'Superheat', desc: 'Superheat calculation right in the app.' },
      { icon: Wrench, title: 'Contactor sizing', desc: 'Contactor and thermal relay with direct-on-line start, step by step.' },
      { icon: BookOpen, title: 'Equipment catalog', desc: 'Photos and manuals of equipment for reference in the field.' },
      { icon: Camera, title: 'Before and after photos', desc: 'Photo evidence attached to the work order, taken from the phone at the customer.' },
      { icon: PenLine, title: 'Digital signature', desc: 'The customer signs on the phone screen and it goes straight into the report.' },
    ],
    testimonialsHeading: 'The technician in control, straight from the phone',
    testimonials: [
      { quote: 'The Technician App became the team\'s official app. Work orders, photos, signature, all from the phone, at the customer.', name: 'Diego F.', role: 'Manager', company: 'refrigeration and HVAC' },
      { quote: 'The refrigerant charge and superheat tools in their pocket cut errors in the field. The technician calculates it right on the spot.', name: 'Aline R.', role: 'Technical Coordinator', company: 'air conditioning maintenance' },
      { quote: 'Having the work order, the calculators, and the catalog all on the phone changed the technician\'s day. They solve it at the customer, without going back to base or carrying printed manuals.', name: 'Thiago P.', role: 'Founder', company: 'refrigeration services' },
    ],
    faq: [
      { q: 'What is the Technician App?', a: 'It is your team\'s field app: an installable app on the phone (PWA) with the work order, the technical calculation tools, and the equipment catalog, all in the palm of the technician\'s hand to use at the customer.' },
      { q: 'Do I need to download it from an app store?', a: 'No. The Technician App is a PWA: it installs straight from the browser on the technician\'s phone, without going through an app store, and stays light and fast.' },
      { q: 'Which technical tools are available?', a: 'Charge and pressure-by-temperature curves for refrigerant gases, superheat calculation, contactor and thermal relay sizing with direct-on-line start, and an equipment catalog with photos and manuals, all on the phone.' },
      { q: 'Can the technician run the work order in the app?', a: 'Yes. They open the complete work order (customer, address, equipment, history), fill out the checklist, take photos, collect the signature, and close the job, all from the phone.' },
      { q: 'Does the team use everything straight from the phone, in the field?', a: 'Yes. The work order, the calculation tools, and the equipment catalog stay on the technician\'s phone, ready to use at the customer. They run the work order, do the calculations, and check the catalog in the field, without going back to the office or carrying printed manuals.' },
      { q: 'Do the calculation tools work for refrigeration and air conditioning?', a: 'Yes. The refrigerant charge, superheat, and pressure curve calculators are aimed at the day-to-day of refrigeration and air conditioning, and the contactor sizing supports installation and equipment startup.' },
      { q: 'How do I get started? Do I need a credit card?', a: 'Just create an account and use it free for 14 days, no credit card. Your team installs the Technician App on their phone and starts working in the field right away.' },
    ],
    finalCta: {
      title: 'Put the whole field on your team\'s phone',
      subtitle: 'Free for 14 days, no credit card. Work orders, technical tools, and the catalog in the Technician App, on your team\'s phone.',
    },
  },
};

export default en;
