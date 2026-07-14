// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo en (English) de segmentos — traduções nativas (Fase 6).
//
// Native English copy for the 9 segment landing pages. Same shape as pt-br.ts
// (SegmentContentMap). Each segment carries an English `slug` so the /en/<slug>
// route, hreflang and sitemap resolve automatically via the slug registry.
//
// Brand name "Dominex" is a proper noun and is never translated.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Thermometer,
  Zap,
  Sun,
  Radio,
  Shield,
  HardHat,
  Building,
  Sparkles,
  Droplets,
  ClipboardList,
  MapPin,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  FileSignature,
  Gauge,
  Boxes,
  Users,
} from 'lucide-react';
import type { SegmentContentMap } from './types';

const en: SegmentContentMap = {
  // ──────────────────────────────────────────────────────────────────────────
  // Refrigeration & HVAC
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-refrigeracao': {
    slug: 'refrigeration-hvac-software',
    metaTitle:
      'Work order and maintenance software for refrigeration and HVAC companies | Dominex',
    metaDescription:
      'Software for refrigeration and HVAC companies: digital work orders, automated preventive maintenance plans, refrigerant tracking per unit, a mobile app for your techs in the field and recurring maintenance contracts. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For refrigeration and air conditioning companies',
      h1: 'Work order and maintenance software for refrigeration and HVAC companies',
      h1Highlight: 'refrigeration and HVAC',
      subtitle:
        'Done with paper work orders and techs showing up without any history. Dominex centralizes your work orders, automates your maintenance schedule and keeps a record of every unit, refrigerant charge and visit right in your hand.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Auto', label: 'preventive maintenance plans generated per unit' },
      { value: '100%', label: 'on your tech phone out in the field' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"Wait, which refrigerant did I put in this unit again?"',
        solution:
          'Every unit keeps its full history: refrigerant type, charge, pressures, superheat and every past visit. The tech opens the work order and sees it all, no call to the office needed.',
      },
      {
        pain: 'Preventive maintenance done in a rush, no paper trail, out of compliance',
        solution:
          'Dominex builds the maintenance schedule automatically per unit, with a checklist for each visit, the responsible technician on record and a report that is ready for an inspection.',
      },
      {
        pain: 'Preventive maintenance contract forgotten until the customer complains',
        solution:
          'Contracts with a configurable cadence (monthly, bimonthly, quarterly) generate the work orders on their own at the right interval. Never miss a preventive visit or blow an SLA again.',
      },
      {
        pain: 'Visit report written by hand, hours later, with no photos and no signature',
        solution:
          'The tech closes the work order in the app with before and after photos, a completed checklist and the customer signature on the spot. The branded PDF report is ready right after.',
      },
    ],
    deepDives: [
      {
        icon: Thermometer,
        title: 'Built for splits, walk-in coolers, chillers and VRF',
        body: 'Register each unit with brand, model, capacity (BTU/ton), refrigerant type and location. Split, multi-split, VRF, chiller, walk-in cooler, fan coil or self-contained, the history is tied to the equipment, not just the customer. When the tech comes back, they know exactly what was done last time, which refrigerant is charged and the target superheat.',
        image: {
          src: '/segmentos/refrigeracao/1.webp',
          alt: 'Air conditioning condensing units installed on the rooftop of a building',
        },
      },
      {
        icon: RefreshCw,
        title: 'Automated preventive maintenance schedule',
        body: 'The maintenance plan is built from the units on the contract: the system spreads the visits across the cycle, builds the checklist for each one, records the responsible technician and produces the maintenance schedule and compliance report ready to show in an inspection. You stay compliant without a side spreadsheet.',
        image: {
          src: '/segmentos/refrigeracao/2.webp',
          alt: 'Technician inspecting the outdoor unit of an HVAC system',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the tech phone, right from the rooftop',
        body: 'Refrigeration service happens on rooftops, in mechanical rooms and in mall basements, and it all gets handled from a phone. The Dominex app installs right on the device (PWA): the tech opens the work order, takes photos, reads pressures, fills the checklist and captures the customer signature right there on site. The work order is ready on the spot, no trip back to the office, no rewriting reports.',
        image: {
          src: '/segmentos/refrigeracao/3.webp',
          alt: 'Technicians servicing an outdoor air conditioning unit on a rooftop',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Digital work orders',
        desc: 'Create, assign and track install, maintenance and repair work orders in seconds, with photos, checklist and customer signature.',
      },
      {
        icon: Gauge,
        title: 'Refrigerant and equipment history',
        desc: 'Refrigerant, charge, pressures and superheat logged per unit. The tech sees it all before climbing to the roof.',
      },
      {
        icon: RefreshCw,
        title: 'Maintenance plans and recurring contracts',
        desc: 'Automated maintenance schedule and preventive contracts that generate work orders on their own at the right interval, per unit.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each tech is and get check-ins validated by radius around the customer address.',
      },
      {
        icon: Calendar,
        title: 'Smart scheduling',
        desc: 'Plan your crew routes, dispatch jobs to the nearest tech and avoid scheduling conflicts.',
      },
      {
        icon: FileSignature,
        title: 'Branded maintenance and work order reports',
        desc: 'PDF ready as soon as the visit ends, with your logo and colors, to hand to the customer and to an inspector.',
      },
      {
        icon: Boxes,
        title: 'Parts and refrigerant inventory',
        desc: 'Track parts, filters and refrigerant cylinders used on each work order, with automatic stock deduction.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Work orders by status, average time to complete and customer ratings in one live dashboard.',
      },
    ],
    testimonials: [
      {
        quote:
          'I stopped losing the history on each unit. The tech gets to the customer, opens the work order and already knows which refrigerant is charged and what was done on the last visit.',
        name: 'Carlos M.',
        role: 'Operations Manager',
        company: 'commercial refrigeration company',
      },
      {
        quote:
          'Maintenance planning used to be a spreadsheet nightmare. Now the system builds the schedule and the report on its own. I walked an inspector through it without breaking a sweat.',
        name: 'Roberta S.',
        role: 'Responsible Technician',
        company: 'commercial HVAC',
      },
      {
        quote:
          'The crew works out in the field all day and does everything on the phone. The tech closes the work order in front of the customer, with photo and signature. The whole operation got much faster.',
        name: 'André P.',
        role: 'Founder',
        company: 'air conditioning maintenance',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for refrigeration and HVAC companies?',
        a: 'Yes. It was built for companies that install and maintain splits, multi-splits, VRF, chillers, walk-in coolers, self-contained and fan coil units. You register each unit, track the refrigerant, generate a maintenance schedule and organize preventive maintenance contracts in one place.',
      },
      {
        q: 'Does the system generate a preventive maintenance plan?',
        a: 'Yes. Dominex builds the maintenance schedule automatically from the units on the contract, with a checklist per visit, the responsible technician on record and a compliance report ready for an inspection. For markets where a formal maintenance plan is required by law, you produce the documentation without a side spreadsheet.',
      },
      {
        q: 'Does the tech work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the tech device (PWA), no app store download needed. On site, the tech opens the work order, takes photos, logs pressures, fills the checklist and captures the customer signature straight from the phone. The work order is ready on the spot.',
      },
      {
        q: 'Can I track the refrigerant and the history of each unit?',
        a: 'Yes. Every unit keeps the refrigerant type, charge, pressures, superheat and every past visit. The tech sees the full equipment history before even reaching the customer.',
      },
      {
        q: 'Do reports come out with my own branding?',
        a: 'Yes. Work order reports and maintenance documents come out as PDFs with your logo and colors. On the White Label plan, the entire customer-facing experience carries your company identity.',
      },
      {
        q: 'How do preventive maintenance contracts work?',
        a: 'You set up the contract with the cadence you want (monthly, bimonthly, quarterly and so on) and Dominex generates the work orders automatically at the right interval, per unit. You never miss a preventive visit or blow an SLA again.',
      },
      {
        q: 'Do I get refrigeration field tools inside the system?',
        a: 'Yes. The Tech Toolkit brings the calculators and tables you use every day: pressure-temperature curves for refrigerants, superheat, sizing and an equipment catalog, all reachable right from the phone in the field.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your units and start opening work orders right away. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Take control of your refrigeration operation',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register your units, build your maintenance schedule and put your field crew in control.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Electrical
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-eletricistas': {
    slug: 'electrician-service-software',
    metaTitle:
      'Work order software for electricians and electrical service companies | Dominex',
    metaDescription:
      'Software for electrical install and maintenance companies: digital work orders, reports and certificates per customer, panel and service-entrance records, safety checklists and a mobile app for your electricians in the field. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For electricians and electrical service companies',
      h1: 'Work order software for electrical service companies',
      h1Highlight: 'electrical service',
      subtitle:
        'Panel wired, service entrance swapped, maintenance done, and none of it turned into a record? Dominex digitizes your work orders, keeps the history of every installation and puts reports, checklists and photos in the electrician hand.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Safety', label: 'checklist on every single visit' },
      { value: '100%', label: 'on your electrician phone in the field' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"What did we do in this customer panel last time?"',
        solution:
          'Every customer and every install point keeps the history: service entrance, breakers replaced, loads, panels and what was done on each visit. The electrician opens the work order and sees it all, no call to the office needed.',
      },
      {
        pain: 'Reports and certificates lost in email, WhatsApp or a drawer',
        solution:
          'Attach reports, certificates and job photos straight to the customer work order. Everything stays organized by address and by equipment, ready to resend whenever the customer asks.',
      },
      {
        pain: 'Install estimates done from memory, with no standard and no paper trail',
        solution:
          'Build estimates with line items, labor and materials, send them by link and track approval. Once approved, it turns into a work order with one click, crew already assigned.',
      },
      {
        pain: 'Job safety with no proof the procedure was followed',
        solution:
          'Configurable checklists enforce the safety and lockout steps on every visit, with a record of who did the work, photos and a signature. You can prove the procedure if you ever need to.',
      },
    ],
    deepDives: [
      {
        icon: Zap,
        title: 'History by service entrance, panel and circuit',
        body: 'Register each customer with the service entrance (single-phase, split-phase, three-phase), the distribution panels, breakers and loads. Preventive maintenance, breaker swap, new circuit or an inspection report, it is all tied to the install point. When the electrician comes back, they already know what is there and what was done before.',
        image: {
          src: '/segmentos/eletrica/1.webp',
          alt: 'Organized electrical distribution panel with breakers and color-coded wiring',
        },
      },
      {
        icon: FileSignature,
        title: 'Branded reports and certificates',
        body: 'When the visit ends, the work order report comes out as a PDF with your logo and colors, with the checklist filled in, before and after photos and the customer signature on the spot. Attach the technical certificate and report to the customer record and keep everything in one place to hand over and to prove the work.',
        image: {
          src: '/segmentos/eletrica/2.webp',
          alt: 'Electrical professional inspecting an industrial electrical panel to verify and document the work',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the electrician phone, right from the job site',
        body: 'Panel wired, service entrance swapped, inspection done, and the record is ready the same instant. The Dominex app installs right on the electrician phone (PWA): on site they open the work order, take before and after photos, run the safety checklist and capture the customer signature right there. The report is ready on the spot, no going back to the office to write it up.',
        image: {
          src: '/segmentos/eletrica/3.webp',
          alt: 'Electrician in a hard hat using a phone on the job site outdoors',
        },
      },
      {
        icon: RefreshCw,
        title: 'Recurring electrical maintenance contracts',
        body: 'Condos, factories and businesses need periodic preventive maintenance on their electrical systems. Set up the contract with the right cadence (monthly, quarterly) and Dominex generates the work orders on its own at the agreed interval, with the inspection checklist ready. You honor the contract without relying on anyone remembering.',
        image: {
          src: '/segmentos/eletrica/4.webp',
          alt: 'Technician in PPE performing maintenance on electrical panels in an industrial setting',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Digital work orders',
        desc: 'Install, maintenance and repair in seconds, with photos, checklist and customer signature right in the app.',
      },
      {
        icon: Zap,
        title: 'Panel and circuit history',
        desc: 'Service entrance, breakers, loads and what was done on each visit, logged by install point.',
      },
      {
        icon: FileSignature,
        title: 'Branded reports and certificates',
        desc: 'Attach certificates and reports to the customer and generate the work order report as a branded PDF at the end of each job.',
      },
      {
        icon: ClipboardList,
        title: 'Electrical safety checklist',
        desc: 'Step-by-step lockout and inspection on every visit, with a record of who did the work.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each electrician is and get check-ins validated by the customer address.',
      },
      {
        icon: Calendar,
        title: 'Smart scheduling',
        desc: 'Plan crew routes, dispatch jobs to the nearest electrician and avoid scheduling conflicts.',
      },
      {
        icon: Boxes,
        title: 'Electrical material inventory',
        desc: 'Track breakers, cable, conduit and connectors used on each work order, with automatic deduction.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Work orders by status, average time to complete and customer ratings in one live dashboard.',
      },
    ],
    testimonials: [
      {
        quote:
          'It all used to live in our heads. Now the electrician gets to the customer and already sees the panel, the service entrance and what was replaced last time. No more redoing work.',
        name: 'Marcelo T.',
        role: 'Owner',
        company: 'commercial electrical installs',
      },
      {
        quote:
          'Certificates and reports were scattered everywhere. Now it is all on the customer record, organized. When they need one, I resend it in seconds.',
        name: 'Patrícia L.',
        role: 'Responsible Technician',
        company: 'industrial electrical maintenance',
      },
      {
        quote:
          'A report with my logo and the customer signature on the spot gave the company a whole new face. Customers trust us more.',
        name: 'Diego F.',
        role: 'Founder',
        company: 'residential electrical services',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for electrical install and maintenance companies?',
        a: 'Yes. It was built for electricians and companies that install and maintain electrical systems: service entrances, distribution panels, three-phase installs, circuits and preventive maintenance. You register each install point, keep the history and generate work orders, estimates and reports in one place.',
      },
      {
        q: 'Can I attach reports and certificates to the work order?',
        a: 'Yes. You attach reports, certificates and photos directly to the customer record and to the work orders. Everything stays organized by address and by installation, ready to resend whenever the customer needs it.',
      },
      {
        q: 'Is there a safety checklist for electrical work?',
        a: 'Yes. You build configurable checklists with the lockout, inspection and safety steps your crew must follow on every visit, with a record of who did the work, photos and a signature. That way you can prove the procedure whenever needed.',
      },
      {
        q: 'Does the electrician work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the electrician device (PWA), no app store download. On site they open the work order, take photos, run the safety checklist and capture the customer signature straight from the phone. The report is ready on the spot.',
      },
      {
        q: 'Can I generate electrical install estimates?',
        a: 'Yes. You build estimates with materials and labor, send them to the customer by link and track approval. When the customer approves, the estimate turns into a work order with one click, crew already assigned.',
      },
      {
        q: 'How do recurring electrical maintenance contracts work?',
        a: 'You set up the contract with the cadence you want (monthly, quarterly and so on) and Dominex generates the work orders automatically at the right interval, with the inspection checklist ready. Perfect for condos, factories and businesses with periodic maintenance.',
      },
      {
        q: 'Can I see where my crew is in the field?',
        a: 'Yes. The live map shows where each electrician is, and the visit check-in is validated by the customer address. You keep an eye on the field operation without making calls.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your customers and start opening work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Put your electrical operation in control',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register your customers, organize your reports and certificates and move your field crew to digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Solar
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-energia-solar': {
    slug: 'solar-installer-software',
    metaTitle:
      'Work order and O&M software for solar energy companies | Dominex',
    metaDescription:
      'Software for solar energy companies: install and O&M work orders, history per site and inverter, module cleaning, generation follow-up, recurring maintenance contracts and a mobile app for your field crew. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For solar installers and energy companies',
      h1: 'Work order and O&M software for solar energy companies',
      h1Highlight: 'solar energy',
      subtitle:
        'Installed the system, but after-sales turned into chaos? Dominex organizes your install and O&M work orders, keeps the history of every site, inverter and visit, and keeps your maintenance contracts running on their own.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'O&M', label: 'site maintenance with history per piece of equipment' },
      { value: '100%', label: 'on your crew phone in the field' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"How many panels are on this site and which inverter is installed?"',
        solution:
          'Every site keeps the full record: number of PV modules, inverter brand and power, string box, mounting and every past visit. The crew opens the work order and sees it all, no digging through the design.',
      },
      {
        pain: 'After-sales and O&M forgotten until generation drops and the customer complains',
        solution:
          'O&M contracts with a configurable cadence generate the cleaning and inspection work orders on their own. You get ahead of a generation drop instead of chasing the loss.',
      },
      {
        pain: 'Module cleaning and inspection done with nothing to prove it',
        solution:
          'The tech closes the work order with before and after cleaning photos, a module and inverter inspection checklist and the customer signature on the spot. You prove the service and protect the contract.',
      },
      {
        pain: 'Install crews scattered around with no idea who is where',
        solution:
          'The live map shows where each crew is, with check-ins validated by the site address. Schedule and route stay organized even with several installs on the same day.',
      },
    ],
    deepDives: [
      {
        icon: Sun,
        title: 'History by site, inverter and string',
        body: 'Register each PV site with the number of modules, installed power (kWp), inverter brand and model, string box and mounting. Every visit, install, cleaning, inspection or equipment swap, is tied to the site. When the crew comes back, they know exactly what is there and what was done before, no need to dig up the original design.',
        image: {
          src: '/segmentos/solar/1.webp',
          alt: 'Aerial view of a solar farm with rows of PV modules in a rural area',
        },
      },
      {
        icon: RefreshCw,
        title: 'O&M contracts that generate the work orders on their own',
        body: 'Operations and maintenance (O&M) is what keeps generation up over the years. Set up the contract with the cleaning and inspection cadence (monthly, quarterly, semiannual) and Dominex generates the work orders automatically at the right interval, with the routine checklist ready. Preventive maintenance happens without you having to remember.',
        image: {
          src: '/segmentos/solar/2.webp',
          alt: 'Three uniformed technicians in hard hats cleaning solar modules on a rooftop',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the crew phone, right on the roof',
        body: 'Sites sit on rooftops, warehouses and rural land, and the crew handles everything from the phone on site. The Dominex app installs right on the device (PWA): the crew opens the work order, photographs the module cleaning, fills the inverter inspection checklist and captures the customer signature right there at the site. The visit report is ready on the spot, no redoing it at the office.',
        image: {
          src: '/segmentos/solar/3.webp',
          alt: 'Solar technician in PPE working on modules on a rooftop under a blue sky',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Digital work orders',
        desc: 'Install, O&M and repair in seconds, with photos, checklist and customer signature right in the app.',
      },
      {
        icon: Sun,
        title: 'History by site and inverter',
        desc: 'Modules, power, inverter and every visit logged per site. The crew sees it all before climbing to the roof.',
      },
      {
        icon: RefreshCw,
        title: 'Recurring O&M contracts',
        desc: 'Cleaning and inspection generate the work orders on their own at the right interval, per site.',
      },
      {
        icon: BarChart3,
        title: 'Operations follow-up',
        desc: 'Work orders by status, average time to complete and customer ratings in one live dashboard.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each crew is and get check-ins validated by the site address.',
      },
      {
        icon: Calendar,
        title: 'Smart scheduling',
        desc: 'Plan the install route and dispatch O&M jobs to the nearest crew.',
      },
      {
        icon: FileSignature,
        title: 'Branded visit report',
        desc: 'PDF ready as soon as cleaning or inspection ends, with your logo, photos and the customer signature.',
      },
      {
        icon: Boxes,
        title: 'Parts and equipment inventory',
        desc: 'Track inverters, modules, connectors and cable used on each work order, with automatic deduction.',
      },
    ],
    testimonials: [
      {
        quote:
          'We sell a lot of systems, but after-sales was chaos. Now every site has an inverter and cleaning history. The crew shows up knowing what they will find.',
        name: 'Rafael G.',
        role: 'Partner',
        company: 'solar integrator',
      },
      {
        quote:
          'The O&M contract became predictable: the system generates the cleaning work orders on its own and generation stops dropping without warning. The customer notices the difference.',
        name: 'Camila V.',
        role: 'O&M Coordinator',
        company: 'PV site maintenance',
      },
      {
        quote:
          'Crew spread across several roofs on the same day. With the live map and the schedule, I stopped calling to find out where everyone is.',
        name: 'Lucas R.',
        role: 'Operations Manager',
        company: 'commercial solar installs',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for solar energy companies?',
        a: 'Yes. It was built for installers and companies that build and maintain PV sites. You register each site with modules, inverter and mounting, keep the install and O&M history and organize your work orders, contracts and reports in one place.',
      },
      {
        q: 'Can I keep the history of each site and inverter?',
        a: 'Yes. Every site keeps the number of modules, the installed power, the inverter brand and model, the string box and every past visit. The crew sees the full site history before even reaching the location.',
      },
      {
        q: 'How do O&M and preventive maintenance contracts work?',
        a: 'You set up the O&M contract with the cleaning and inspection cadence (monthly, quarterly, semiannual) and Dominex generates the work orders automatically at the right interval, with the routine checklist ready. Preventive maintenance happens without relying on the crew memory.',
      },
      {
        q: 'Does the crew work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the crew device (PWA), no app store download. At the site, the crew opens the work order, photographs the module cleaning, fills the inverter inspection checklist and captures the customer signature straight from the phone. The report is ready on the spot.',
      },
      {
        q: 'Can I prove the module cleaning and inspection?',
        a: 'Yes. The tech closes the work order with before and after cleaning photos, a completed inspection checklist and the customer signature on the spot. The branded PDF report is ready to hand to the customer and prove the service.',
      },
      {
        q: 'Does Dominex monitor generation in real time?',
        a: 'Dominex organizes the field service: work orders, O&M contracts, history per site and proof of each visit. It does not replace your inverter portal, but it centralizes everything the crew does at the site so maintenance keeps generation on track.',
      },
      {
        q: 'Can I see where my install crew is?',
        a: 'Yes. The live map shows where each crew is, and the visit check-in is validated by the site address. You plan the route even with several installs on the same day.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your sites and start opening work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Organize the install and O&M of your sites',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register your sites, automate your maintenance contracts and move your field crew to digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ISP / Telecom
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-provedores': {
    slug: 'isp-field-service-software',
    metaTitle:
      'Work order software for internet service providers and telecom companies | Dominex',
    metaDescription:
      'Software for internet service providers (ISP) and telecom: fiber install work orders, support tickets, visit scheduling, per-subscriber CTO and ONU history, equipment tracking and a mobile app for your techs in the field. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For internet service providers and telecom companies',
      h1: 'Work order software for internet service providers and telecom',
      h1Highlight: 'internet service providers',
      subtitle:
        'Fiber install, support ticket, ONU swap, and every tech scribbling in a notebook? Dominex organizes your work orders, schedules the visits and keeps the CTO, ONU and equipment history of every subscriber.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Fiber', label: 'install and support with per-subscriber history' },
      { value: '100%', label: 'on your tech phone in the field' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"Which CTO is this customer on and which ONU was installed?"',
        solution:
          'Every subscriber keeps the history: source CTO, ONU model and serial number, router and every past visit. The tech opens the work order and sees it all, no call to the NOC needed.',
      },
      {
        pain: 'Support tickets that drag on because nobody knows what was already done',
        solution:
          'Every ticket becomes a work order with the subscriber history, photos of the problem and a record of what was fixed. The next visit starts already knowing the context.',
      },
      {
        pain: 'Scheduling on a "we will swing by tomorrow" basis while the customer waits all day',
        solution:
          'Smart scheduling dispatches tickets to the nearest tech, plans the day route and gives a predictable arrival window. Fewer missed visits, fewer angry customers.',
      },
      {
        pain: 'Equipment pulled or swapped and nobody updated inventory',
        solution:
          'Equipment tracking per work order: ONU, router and drop logged at install and removal, with automatic stock deduction. You always know where each device is.',
      },
    ],
    deepDives: [
      {
        icon: Radio,
        title: 'Fiber, CTO and ONU history per subscriber',
        body: 'Register each subscriber with their connection point: source CTO, port, ONU model and serial number, router and installed drop. Fiber install, equipment swap, repair or support, it is all tied to the subscriber. When the tech comes back, they already know the CTO, the equipment and what was done before, no digging through the NOC system.',
        image: {
          src: '/segmentos/telecom/1.webp',
          alt: 'Telecom technician handling network cables in a rack to log the connection point',
        },
      },
      {
        icon: Calendar,
        title: 'Visit scheduling and crew routing',
        body: 'Install and support tickets go into the schedule and get dispatched to the nearest tech to the address. The day route is planned to cut travel time and the customer gets a predictable arrival window. Fewer missed visits, less tech idle time and more installs per day.',
        image: {
          src: '/segmentos/telecom/2.webp',
          alt: 'Telecom tower with antennas covering the provider service area',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the tech phone, right up the pole',
        body: 'Fiber install happens on poles, in splice boxes, in basements and in buildings, and the tech handles everything from the phone on site. The Dominex app installs right on the device (PWA): they open the work order, log the CTO and ONU, take install photos, fill the checklist and capture the subscriber signature right there. The work order is ready on the spot, no trip back to the NOC to close it.',
        image: {
          src: '/segmentos/telecom/3.webp',
          alt: 'Technician in a hard hat and safety harness working on cables at the top of a pole',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Work orders and tickets',
        desc: 'Install, support and removal in seconds, with photos, checklist and subscriber signature in the app.',
      },
      {
        icon: Radio,
        title: 'CTO, ONU and drop history',
        desc: 'Connection point, equipment and every visit logged per subscriber. The tech sees it all before arriving.',
      },
      {
        icon: Calendar,
        title: 'Visit scheduling',
        desc: 'Dispatch tickets to the nearest tech, plan the route and give the customer an arrival window.',
      },
      {
        icon: Boxes,
        title: 'Equipment tracking',
        desc: 'ONU, router and drop logged at install and removal, with automatic stock deduction.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each tech is and get check-ins validated by the subscriber address.',
      },
      {
        icon: RefreshCw,
        title: 'Repeat issues under control',
        desc: 'Ticket history per subscriber makes it clear when a problem came back and what was already tried.',
      },
      {
        icon: FileSignature,
        title: 'Branded visit report',
        desc: 'PDF ready as soon as the install or repair ends, with your logo and the customer signature.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Tickets by status, average time to complete and subscriber ratings in one live dashboard.',
      },
    ],
    testimonials: [
      {
        quote:
          'Every tech took notes their own way. Now the CTO and ONU history lives on the subscriber. Support got much faster.',
        name: 'Fábio M.',
        role: 'Technical Coordinator',
        company: 'regional internet provider',
      },
      {
        quote:
          'Scheduling organized our routing. The tech does more fiber installs per day and the customer stops waiting all day.',
        name: 'Juliana C.',
        role: 'Operations Manager',
        company: 'fiber ISP',
      },
      {
        quote:
          'Equipment used to disappear along the way. With deduction per work order, I know where every ONU and router is.',
        name: 'Rodrigo A.',
        role: 'Partner',
        company: 'broadband provider',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for internet service providers and telecom companies?',
        a: 'Yes. It was built for ISPs and telecom companies that install fiber, handle support tickets and manage equipment in the field. You register each subscriber with their connection point, keep the CTO and ONU history and organize work orders, scheduling and reports in one place.',
      },
      {
        q: 'Can I record the CTO and ONU of each subscriber?',
        a: 'Yes. Every subscriber keeps the source CTO, the port, the ONU model and serial number, the router and the installed drop, plus every past visit. The tech sees the full history before reaching the address.',
      },
      {
        q: 'Is there visit scheduling and routing?',
        a: 'Yes. Install and support tickets go into the schedule and get dispatched to the nearest tech, with the day route planned to cut travel time. The customer gets a predictable arrival window and you cut missed visits.',
      },
      {
        q: 'Can I track the equipment (ONU, router, drop)?',
        a: 'Yes. Each device is logged at install and removal per work order, with automatic stock deduction. You know where every ONU and router is and avoid losing equipment.',
      },
      {
        q: 'Does the tech work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the tech device (PWA), no app store download. On the install, they open the work order, log the CTO and ONU, take photos, fill the checklist and capture the subscriber signature straight from the phone. The work order is ready on the spot.',
      },
      {
        q: 'Can I track repeat tickets?',
        a: 'Yes. The ticket history per subscriber makes it clear when a problem came back and what was already tried, helping your support team fix it for good instead of treating every ticket as new.',
      },
      {
        q: 'Can I see where my techs are in the field?',
        a: 'Yes. The live map shows where each tech is, and the visit check-in is validated by the subscriber address. You keep an eye on the operation without making calls.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your subscribers and start opening work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Put your ISP in control of the field',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register your subscribers, organize your fiber installs and move your support crew to digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Security / CCTV
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-cftv': {
    slug: 'security-cctv-service-software',
    metaTitle:
      'Work order software for CCTV and security system companies | Dominex',
    metaDescription:
      'Software for CCTV and electronic security companies: install and maintenance work orders for cameras, alarms and access control, history per device, recurring monitoring contracts and a mobile app for your techs in the field. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For CCTV and electronic security companies',
      h1: 'Work order software for CCTV and security system companies',
      h1Highlight: 'CCTV and security systems',
      subtitle:
        'Camera installed, alarm configured, access control delivered, and the history disappears? Dominex organizes your work orders, keeps a record of every device and keeps your monitoring contracts running.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'CCTV', label: 'install and maintenance with history per device' },
      { value: '100%', label: 'on your tech phone in the field' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"How many cameras does this customer have and which DVR is installed?"',
        solution:
          'Every customer keeps the record: camera count and model, DVR/NVR, alarm, sensors, access control and every visit. The tech opens the work order and sees it all, no call to the office needed.',
      },
      {
        pain: 'Monitoring contract forgotten until the camera dies and the customer notices',
        solution:
          'Monitoring and maintenance contracts with a configurable cadence generate the inspection work orders on their own. You get ahead of a failure instead of finding out with the customer.',
      },
      {
        pain: 'Maintenance and rounds done with nothing to prove it',
        solution:
          'The tech closes the work order with photos of the cameras and system, a completed inspection checklist and the customer signature. You prove every visit and protect the contract.',
      },
      {
        pain: 'Crew scattered across several installs with no control',
        solution:
          'The live map shows where each tech is, with check-ins validated by the customer address. Schedule and route stay organized even with many jobs in one day.',
      },
    ],
    deepDives: [
      {
        icon: Shield,
        title: 'History of cameras, alarm and access control',
        body: 'Register each customer with the installed setup: cameras (model, position, IP), DVR/NVR, alarm panel, sensors, locks and access control. Install, corrective maintenance, repositioning or equipment swap, it is all tied to the customer. When the tech comes back, they already know what is there and what was done before.',
        image: {
          src: '/segmentos/cftv/1.webp',
          alt: 'A cluster of CCTV security cameras mounted on a pole pointing in several directions',
        },
      },
      {
        icon: RefreshCw,
        title: 'Recurring monitoring and maintenance contracts',
        body: 'Monitoring and periodic maintenance of the security system are the recurring revenue of the business. Set up the contract with the inspection cadence (monthly, quarterly) and Dominex generates the work orders automatically at the right interval, with the technical rounds checklist ready. Preventive service happens without you having to remember.',
        image: {
          src: '/segmentos/cftv/2.webp',
          alt: 'Operator in a monitoring room watching camera feeds across several screens',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the tech phone, right on the facade',
        body: 'CCTV install and maintenance happen on rooftops, facades and parking areas, and the tech handles everything from the phone on site. The Dominex app installs right on the device (PWA): they open the work order, photograph each camera, log the equipment, fill the checklist and capture the customer signature right there. The work order is ready on the spot, no going back to the office to close it.',
        image: {
          src: '/segmentos/cftv/3.webp',
          alt: 'A dome security camera mounted on the facade of a building',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Digital work orders',
        desc: 'Install, maintenance and repair in seconds, with photos, checklist and customer signature in the app.',
      },
      {
        icon: Shield,
        title: 'Installed setup history',
        desc: 'Cameras, DVR/NVR, alarm and access control logged per customer. The tech sees it all before arriving.',
      },
      {
        icon: RefreshCw,
        title: 'Monitoring contracts',
        desc: 'Maintenance and inspection generate the work orders on their own at the right interval, per customer.',
      },
      {
        icon: Calendar,
        title: 'Smart scheduling',
        desc: 'Plan crew routes, dispatch jobs to the nearest tech and avoid scheduling conflicts.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each tech is and get check-ins validated by the customer address.',
      },
      {
        icon: Boxes,
        title: 'Equipment inventory',
        desc: 'Track cameras, cable, connectors and panels used on each work order, with automatic deduction.',
      },
      {
        icon: FileSignature,
        title: 'Branded visit report',
        desc: 'PDF ready as soon as the install or maintenance ends, with your logo and the customer signature.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Work orders by status, average time to complete and customer ratings in one live dashboard.',
      },
    ],
    testimonials: [
      {
        quote:
          'We used to get to the customer with no idea how many cameras were there. Now the whole setup lives on the record. Service is a different game.',
        name: 'Bruno S.',
        role: 'Owner',
        company: 'CCTV and alarm installs',
      },
      {
        quote:
          'The monitoring contract became predictable. The system generates the inspection work orders and we get ahead of a failure before the customer complains.',
        name: 'Aline R.',
        role: 'Technical Coordinator',
        company: 'commercial electronic security',
      },
      {
        quote:
          'Crew across several jobs on the same day. With the schedule and the live map, I stopped calling to find out where everyone is.',
        name: 'Thiago P.',
        role: 'Manager',
        company: 'access control and CCTV',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for CCTV and electronic security companies?',
        a: 'Yes. It was built for companies that install and maintain cameras, alarms, sensors and access control. You register each customer installed setup, keep the history per device and organize work orders, monitoring contracts and reports in one place.',
      },
      {
        q: 'Can I record each customer camera and equipment setup?',
        a: 'Yes. Every customer keeps the camera count and model, the DVR/NVR, the alarm panel, the sensors and the access control, plus every past visit. The tech sees the full history before reaching the address.',
      },
      {
        q: 'How do monitoring and maintenance contracts work?',
        a: 'You set up the contract with the inspection cadence (monthly, quarterly and so on) and Dominex generates the work orders automatically at the right interval, with the technical rounds checklist ready. Preventive maintenance happens without relying on the crew memory.',
      },
      {
        q: 'Can I prove the maintenance and technical rounds?',
        a: 'Yes. The tech closes the work order with photos of the cameras and system, a completed inspection checklist and the customer signature on the spot. The branded PDF report is ready to hand over and prove the visit.',
      },
      {
        q: 'Does the tech work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the tech device (PWA), no app store download. On site they open the work order, photograph each camera, log the equipment, fill the checklist and capture the customer signature straight from the phone. The work order is ready on the spot.',
      },
      {
        q: 'Can I track the inventory of cameras and equipment?',
        a: 'Yes. You track cameras, cable, connectors and panels used on each work order, with automatic stock deduction. That way you know what you have and what went into each install.',
      },
      {
        q: 'Can I see where my crew is in the field?',
        a: 'Yes. The live map shows where each tech is, and the visit check-in is validated by the customer address. You keep an eye on the operation even with many jobs on the same day.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your customers and start opening work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Put your security operation in control',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register each customer setup, automate your monitoring contracts and move your crew to digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Construction
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-construcao-civil': {
    slug: 'construction-service-software',
    metaTitle:
      'Work order software for construction companies and job sites | Dominex',
    metaDescription:
      'Software for construction: work orders for field crews, inspections and measurements, schedule follow-up, post-handover warranty service with per-unit history and a mobile app for your crew on the job site. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For builders and construction companies',
      h1: 'Work order software for construction companies',
      h1Highlight: 'construction',
      subtitle:
        'Crew on the job, inspection pending, warranty callbacks with no record? Dominex organizes the work orders for your field crews, logs inspections and measurements and keeps the history of every unit right in your hand.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Site', label: 'field crews and inspections with photo records' },
      { value: '100%', label: 'on your crew phone on the job site' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"What was left open on this inspection again?"',
        solution:
          'Every inspection becomes a work order with a checklist, photos and open items logged. The crew opens the work order and sees what is left to fix, with a due date and an owner, no side spreadsheet.',
      },
      {
        pain: 'Post-handover warranty service turning into a headache and unhappy customers',
        solution:
          'Every unit keeps the history of warranty callbacks. When the customer calls, the crew already knows what was done before and closes the callback with photo and signature, no rework.',
      },
      {
        pain: 'Contractor work measured from memory, with nothing to prove it',
        solution:
          'Log the measurement with photos, checklist and description right on the work order. You document what was actually done in the field before releasing crew or contractor payment.',
      },
      {
        pain: 'Crews scattered across several sites with no control',
        solution:
          'The live map shows where each crew is, with check-ins validated by the job site address. Schedule and tasks stay organized even with several fronts at once.',
      },
    ],
    deepDives: [
      {
        icon: HardHat,
        title: 'Work orders for field crews and inspections',
        body: 'Assign tasks and inspections to your field crews as work orders, each with a checklist, photos and open items. Handover inspection, stage inspection, contractor measurement or a fix, it is all logged with an owner, a due date and photo proof. The office follows progress without going to the job site.',
        image: {
          src: '/segmentos/construcao/1.webp',
          alt: 'A hard-hatted worker inspecting a construction job site',
        },
      },
      {
        icon: Building,
        title: 'Per-unit history and post-handover warranty service',
        body: 'Register each unit or development and tie warranty callbacks to it. When the customer requests a repair within warranty, the crew opens the work order and already sees that unit history: what was handed over, what has already been fixed and what is still open. Warranty service stops being improvised and starts leaving a trail.',
        image: {
          src: '/segmentos/construcao/2.webp',
          alt: 'A multi-story residential development under construction with scaffolding',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the crew phone, right on the job site',
        body: 'The job site is where the work happens: basements, structure, areas under construction, and the crew handles everything from the phone on site. The Dominex app installs right on the device (PWA): the crew opens the work order, logs the inspection, takes stage photos, fills the checklist and captures the signature right there on site. The report is ready on the spot, no redoing it at the office.',
        image: {
          src: '/segmentos/construcao/3.webp',
          alt: 'A construction worker checking the project plans on a tablet at the job site',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Work orders for the field',
        desc: 'Assign tasks and inspections to crews in seconds, with checklist, photos and open items.',
      },
      {
        icon: Building,
        title: 'History per unit and site',
        desc: 'Inspections, measurements and callbacks logged per unit. The crew sees the history before acting.',
      },
      {
        icon: ClipboardList,
        title: 'Inspections and measurements with photos',
        desc: 'Photo records and a checklist for each stage, with owner and due date, ready to prove.',
      },
      {
        icon: RefreshCw,
        title: 'Post-handover warranty service',
        desc: 'Warranty callbacks tied to the unit, with a history of what has already been fixed.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each crew is and get check-ins validated by the job site address.',
      },
      {
        icon: Calendar,
        title: 'Crew schedule and tasks',
        desc: 'Organize the work fronts, assign tasks and follow schedule progress.',
      },
      {
        icon: FileSignature,
        title: 'Branded inspection report',
        desc: 'PDF ready as soon as the inspection or measurement ends, with your logo, photos and signature.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Work orders by status, open items per site and average time to complete in one live dashboard.',
      },
    ],
    testimonials: [
      {
        quote:
          'Inspections used to live in spreadsheets and loose photos on a phone. Now every open item becomes a work order with a due date and an owner. The office follows along without going to the site.',
        name: 'Eduardo M.',
        role: 'Site Engineer',
        company: 'development builder',
      },
      {
        quote:
          'Post-handover warranty service was chaos. Now every unit has a history and the crew shows up knowing what was already fixed. The customer feels the difference.',
        name: 'Renata B.',
        role: 'Post-Handover Coordinator',
        company: 'developer and builder',
      },
      {
        quote:
          'Crews on several sites at once. With the live map and the tasks, I know what each front is doing without calling anyone.',
        name: 'Sérgio T.',
        role: 'Field Manager',
        company: 'construction and remodeling company',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for construction companies?',
        a: 'Yes. It was built for builders, developers and construction companies that need to organize field crews, inspections, measurements and post-handover warranty service. You assign tasks as work orders, log each stage with photos and keep the history per unit in one place.',
      },
      {
        q: 'Can I log inspections and open items?',
        a: 'Yes. Every inspection becomes a work order with a checklist, photos and open items, each with an owner and a due date. The office follows what is left to fix without going to the job site.',
      },
      {
        q: 'Can I manage post-handover warranty service?',
        a: 'Yes. Every unit keeps the history of warranty callbacks. When the customer requests a repair within warranty, the crew opens the work order and already sees what was handed over, what has been fixed and what is still open, no rework.',
      },
      {
        q: 'How do field measurements work?',
        a: 'You log the measurement with photos, checklist and description right on the work order. That way you document what was actually done in the field before releasing crew or contractor payment, with visual proof.',
      },
      {
        q: 'Does the crew work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the crew device (PWA), no app store download. On the job site the crew opens the work order, logs the inspection, takes stage photos, fills the checklist and captures the signature straight from the phone. The report is ready on the spot.',
      },
      {
        q: 'Can I follow schedule progress?',
        a: 'Yes. Tasks and work fronts stay organized on the schedule, and the dashboard shows work orders by status and open items per site. You follow crew progress without relying on a manual report.',
      },
      {
        q: 'Can I see where my crews are in the field?',
        a: 'Yes. The live map shows where each crew is, and the visit check-in is validated by the job site address. You keep an eye on several fronts at once without making calls.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your sites and start assigning work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Put your job site crews in control',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Organize inspections, measurements and post-handover warranty service and move your field crews to digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Elevators
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-elevadores': {
    slug: 'elevator-maintenance-software',
    metaTitle:
      'Work order software for elevator maintenance companies | Dominex',
    metaDescription:
      'Software for elevator maintenance companies: preventive and emergency work orders, recurring monthly contracts, per-unit history, emergency callouts and a mobile app for your techs in the machine room. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For elevator maintenance companies',
      h1: 'Work order software for elevator maintenance companies',
      h1Highlight: 'elevator maintenance',
      subtitle:
        'Monthly contract, preventive on time, emergency callout handled, and the history of each elevator disappears? Dominex organizes your work orders, keeps your recurring contracts running and holds the record of every unit.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Monthly', label: 'preventive contracts generating work orders on their own' },
      { value: '100%', label: 'on your tech phone in the machine room' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"What was done on this elevator at the last preventive?"',
        solution:
          'Every elevator keeps the full history: brand, capacity, number of stops, parts replaced and every visit. The tech opens the work order and sees it all, no call to the office needed.',
      },
      {
        pain: 'Monthly preventive forgotten until the contract gets questioned',
        solution:
          'Monthly maintenance contracts generate the preventive work orders automatically, at the right interval, with the routine checklist ready. You honor the contract without relying on anyone remembering.',
      },
      {
        pain: 'Emergency callout handled with no record of who went or what was fixed',
        solution:
          'The emergency callout becomes a work order with the time, the tech, a description and a photo of what was fixed. You can prove the response and the response time anytime.',
      },
      {
        pain: 'Proof of maintenance and compliance scattered on paper',
        solution:
          'Every visit generates a branded PDF report with the checklist filled in and the building manager or responsible party signature. The elevator compliance history stays organized and ready to present.',
      },
    ],
    deepDives: [
      {
        icon: Building,
        title: 'Full history per elevator',
        body: 'Register each elevator with brand, model, capacity, number of stops, machine type and location in the building. Preventive, corrective, part replacement or modernization, it is all tied to the equipment, not just the building. When the tech comes back, they know exactly what was done on the last visit and which parts have already been replaced.',
        image: {
          src: '/segmentos/elevadores/1.webp',
          alt: 'Stainless steel elevator doors in the lobby of a modern building',
        },
      },
      {
        icon: RefreshCw,
        title: 'Monthly contracts that generate the preventive on their own',
        body: 'Monthly preventive maintenance is the backbone of an elevator contract. Set up the contract with a monthly cadence and Dominex generates the work orders automatically at the right interval, with the preventive routine checklist ready. You never miss a contractual visit and never get caught out if the customer questions the frequency.',
        image: {
          src: '/segmentos/elevadores/2.webp',
          alt: 'Technician performing maintenance on industrial machinery',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the tech phone, right in the machine room',
        body: 'The machine room, the pit and the hoistway are where the work happens, and the tech handles everything from the phone right there. The Dominex app installs right on the device (PWA): they open the work order, fill the inspection checklist, log parts, take photos and capture the responsible party signature on site. The report is ready on the spot, no redoing it at the office.',
        image: {
          src: '/segmentos/elevadores/3.webp',
          alt: 'View of an illuminated industrial elevator pit',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Digital work orders',
        desc: 'Preventive, corrective and emergency in seconds, with checklist, photos and signature in the app.',
      },
      {
        icon: Building,
        title: 'History per elevator',
        desc: 'Brand, capacity, stops and parts replaced logged per unit. The tech sees it all before arriving.',
      },
      {
        icon: RefreshCw,
        title: 'Recurring monthly contracts',
        desc: 'The monthly preventive generates the work orders on its own, at the right interval, per elevator.',
      },
      {
        icon: Calendar,
        title: 'Emergency callout',
        desc: 'Emergency service logged with time, tech and a proven response time.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each tech is and get check-ins validated by the building address.',
      },
      {
        icon: Boxes,
        title: 'Parts inventory',
        desc: 'Track parts and components used on each work order, with automatic stock deduction.',
      },
      {
        icon: FileSignature,
        title: 'Branded maintenance report',
        desc: 'PDF ready as soon as the visit ends, with your logo, checklist and the responsible party signature.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Work orders by status, emergency response time and visits per contract in one live dashboard.',
      },
    ],
    testimonials: [
      {
        quote:
          'Every elevator now has a part and preventive history. The tech shows up knowing what was done last time. No more "I did not know."',
        name: 'Marcos V.',
        role: 'Technical Manager',
        company: 'elevator maintenance',
      },
      {
        quote:
          'The monthly preventive generates the work orders on its own. No building manager has ever again charged me for a visit I could not prove.',
        name: 'Cláudia F.',
        role: 'Responsible Technician',
        company: 'elevator servicing',
      },
      {
        quote:
          'Emergency callouts are all logged with time and response time. That weighed a lot in contract renewals.',
        name: 'Henrique L.',
        role: 'Partner',
        company: 'elevators and platforms',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for elevator maintenance companies?',
        a: 'Yes. It was built for companies that do preventive and corrective elevator maintenance under a monthly contract. You register each elevator, keep the history per unit, generate the preventives automatically and log the emergency callouts in one place.',
      },
      {
        q: 'How do monthly preventive contracts work?',
        a: 'You set up the contract with a monthly cadence and Dominex generates the preventive work orders automatically at the right interval, with the routine checklist ready. You honor the contract without relying on the crew memory and stay protected if the frequency is questioned.',
      },
      {
        q: 'Can I record the history of each elevator?',
        a: 'Yes. Every elevator keeps brand, capacity, number of stops, parts replaced and every past visit. The tech sees the full equipment history before even reaching the building.',
      },
      {
        q: 'How do emergency callouts work?',
        a: 'The emergency callout becomes a work order with the opening time, the responsible tech, a description and a photo of what was fixed. You can prove the response and the response time anytime, which weighs in contract renewals.',
      },
      {
        q: 'Does the tech work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the tech device (PWA), no app store download. In the machine room they open the work order, fill the inspection checklist, log parts, take photos and capture the responsible party signature straight from the phone. The report is ready on the spot.',
      },
      {
        q: 'Does it generate a maintenance report for the building?',
        a: 'Yes. Every visit generates a branded PDF report with the checklist filled in and the building manager or responsible party signature. The elevator maintenance and compliance history stays organized and ready to present.',
      },
      {
        q: 'Can I track the parts used on each visit?',
        a: 'Yes. You log the parts and components used on each work order, with automatic stock deduction. That way you know what went into each elevator and keep control of what you have on hand.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your elevators and start opening work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Put your elevator maintenance in control',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register your elevators, automate the monthly preventive and move your field crew to digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Cleaning
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-limpeza-conservacao': {
    slug: 'cleaning-service-software',
    metaTitle:
      'Work order software for cleaning and janitorial companies | Dominex',
    metaDescription:
      'Software for cleaning and janitorial companies: work orders per site and contract, cleaning checklists, rounds with photo and signature proof, field crew control and a mobile app for your crew. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For cleaning and janitorial companies',
      h1: 'Work order software for cleaning and janitorial companies',
      h1Highlight: 'cleaning and janitorial',
      subtitle:
        'A site with no proof of service, rounds with no record, a customer questioning what got done? Dominex organizes work orders by contract and site, with a checklist, photo and signature proving every cleaning.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Site', label: 'service per contract with photo proof' },
      { value: '100%', label: 'on your crew phone in the field' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"How do I prove to the customer that the cleaning was done?"',
        solution:
          'Every service closes with a completed checklist, before and after photos and the on-site supervisor signature. You prove it was done and end the "it was not done" argument.',
      },
      {
        pain: 'Rounds and routine work with no record of who came and when',
        solution:
          'The round becomes a work order with a check-in validated by location and time. You know exactly who was at each site and what was done, without relying on the crew word.',
      },
      {
        pain: 'A contract with several sites and no control over what got done',
        solution:
          'Register each contract with its sites and routines. The work orders are generated at the right interval and you follow compliance for each site on a dashboard, not on trust.',
      },
      {
        pain: 'Crews scattered across several customers with no visibility',
        solution:
          'The live map shows where each crew is, with check-ins validated by the site address. Schedule and routines stay organized even with many contracts at once.',
      },
    ],
    deepDives: [
      {
        icon: Sparkles,
        title: 'Work orders per contract and site',
        body: 'Register each contract with its service sites and the cleaning and janitorial routines. Every visit becomes a work order with the routine checklist, photos and a signature. You follow what got done at each site and have the record ready to show the customer whenever the service is questioned.',
        image: {
          src: '/segmentos/limpeza/1.webp',
          alt: 'A uniformed professional cleaning crew vacuuming the floor of a commercial space',
        },
      },
      {
        icon: MapPin,
        title: 'Rounds and check-in with location and time proof',
        body: 'The round and janitorial routine are logged with a check-in validated by the site address and the time of the pass. You know who was at each location, at what time and what got done, with photo and signature. The proof replaces the crew word and protects the contract in any customer audit.',
        image: {
          src: '/segmentos/limpeza/2.webp',
          alt: 'A janitorial professional doing a round and cleaning an access walkway',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the crew phone, right at the site',
        body: 'Cleaning sites include basements, garages and stairwells, and the crew handles everything from the phone on site. The Dominex app installs right on the device (PWA): the crew opens the work order, checks off the routine checklist, takes before and after photos and captures the supervisor signature right there at the site. The proof is logged on the spot, no writing it up later.',
        image: {
          src: '/segmentos/limpeza/3.webp',
          alt: 'A cleaning worker in protective gear squeegeeing the floor of a warehouse',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Work orders per site',
        desc: 'Cleaning and janitorial routines in seconds, with checklist, photos and signature in the app.',
      },
      {
        icon: Sparkles,
        title: 'Configurable cleaning checklist',
        desc: 'Build the step-by-step for each routine and make sure nothing gets missed at the site.',
      },
      {
        icon: MapPin,
        title: 'Rounds with validated check-in',
        desc: 'A record of who passed through each site, with location and time proven.',
      },
      {
        icon: RefreshCw,
        title: 'Recurring contracts and routines',
        desc: 'The site work orders are generated at the right interval, no spreadsheet needed.',
      },
      {
        icon: Calendar,
        title: 'Crew schedule',
        desc: 'Organize the sites for the day, assign the crews and follow routine compliance.',
      },
      {
        icon: FileSignature,
        title: 'Photo and signature proof',
        desc: 'Before and after photos and the supervisor signature close every service, ready to present.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Routines completed per site, open items and customer ratings in one live dashboard.',
      },
      {
        icon: Users,
        title: 'Field crew control',
        desc: 'See on the map where each crew is and follow several contracts at once.',
      },
    ],
    testimonials: [
      {
        quote:
          'The customer kept saying the cleaning was not done. Now every site has before and after photos and a signature. The argument is over.',
        name: 'Vanessa M.',
        role: 'Contracts Manager',
        company: 'cleaning and janitorial company',
      },
      {
        quote:
          'Rounds now have a check-in with time and location. I know exactly who passed through each site and at what time.',
        name: 'Paulo R.',
        role: 'Operations Supervisor',
        company: 'building janitorial',
      },
      {
        quote:
          'With several contracts running at once, the dashboard shows me what got done at each site without me calling anyone.',
        name: 'Sandra L.',
        role: 'Partner',
        company: 'outsourced cleaning services',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for cleaning and janitorial companies?',
        a: 'Yes. It was built for companies that run cleaning and janitorial sites and contracts. You register each contract with its sites and routines, generate the work orders, prove the service with photo and signature and follow compliance in one place.',
      },
      {
        q: 'How do I prove to the customer that the cleaning was done?',
        a: 'Every service closes with a completed checklist, before and after photos and the on-site supervisor signature. The branded PDF report is ready to present, ending the "it was not done" argument.',
      },
      {
        q: 'Can I log the rounds and janitorial routine?',
        a: 'Yes. The round becomes a work order with a check-in validated by the site address and the time of the pass. You know who was at each location, at what time and what got done, without relying on the crew word.',
      },
      {
        q: 'Can I manage contracts with several sites?',
        a: 'Yes. You register each contract with its sites and routines, the work orders are generated at the right interval and the dashboard shows compliance for each site. You follow everything without a spreadsheet and without relying only on the crew word.',
      },
      {
        q: 'Does the crew work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the crew device (PWA), no app store download. At the site the crew opens the work order, checks off the routine checklist, takes before and after photos and captures the supervisor signature straight from the phone. The proof is logged on the spot.',
      },
      {
        q: 'Can I build the checklist for each cleaning routine?',
        a: 'Yes. You build configurable checklists with the step-by-step for each cleaning and janitorial routine, making sure nothing gets missed at the site and the crew follows the standard agreed with the customer.',
      },
      {
        q: 'Can I see where my crews are in the field?',
        a: 'Yes. The live map shows where each crew is, and the check-in is validated by the site address. You follow several contracts at once without making calls.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your contracts and sites and start opening work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Prove every cleaning and protect your contracts',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register your sites, organize the routines and move your field crews to digital with proof.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Pest control
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-dedetizacao': {
    slug: 'pest-control-service-software',
    metaTitle:
      'Work order software for pest control companies | Dominex',
    metaDescription:
      'Software for pest control companies: work orders with a record of products applied, service certificates, recurring contracts, periodic scheduling and a mobile app for your applicators in the field. Free 14-day trial, no credit card.',
    hero: {
      eyebrow: 'For pest control companies',
      h1: 'Work order software for pest control companies',
      h1Highlight: 'pest control',
      subtitle:
        'Products applied with no record, certificate rushed at the last minute, recurring contract forgotten? Dominex organizes your work orders, records the products applied and issues a branded certificate on every visit.',
    },
    metrics: [
      { value: '50k+', label: 'work orders per month on the platform' },
      { value: 'Certificate', label: 'issued on every single visit' },
      { value: '100%', label: 'on your applicator phone in the field' },
      { value: '4.9/5', label: 'satisfaction from the companies that use it' },
    ],
    pains: [
      {
        pain: '"Which product and dose did we apply for this customer?"',
        solution:
          'Every visit records the products applied, the dose, the method and the target pest. The history is tied to the customer, and the applicator opens the work order and sees what was used before, no call to the office needed.',
      },
      {
        pain: 'Service certificate done by hand, afterward, with no standard',
        solution:
          'The service certificate comes out as a branded PDF as soon as the visit ends, with the products applied, the valid-through date and the responsible technician. Delivered on the spot, no rework.',
      },
      {
        pain: 'Recurring contract forgotten until the pests come back and the customer complains',
        solution:
          'Pest control contracts with a configurable cadence generate the re-treatment work orders on their own, at the right interval. You keep the customer protected and the contract active.',
      },
      {
        pain: 'Applicator in the field with nothing to prove what was done',
        solution:
          'The applicator closes the work order with job photos, a completed checklist and the customer signature. You prove the application and protect the company in any inspection.',
      },
    ],
    deepDives: [
      {
        icon: Droplets,
        title: 'Record of products applied and service certificate',
        body: 'Every visit records the products applied, the dose, the method (spraying, bait station, gel), the target pest and the responsible technician. From that record, the service certificate comes out as a branded PDF, with the valid-through date and the products used, ready to hand to the customer and to present to a health inspector. Nothing is filled in by hand afterward.',
        image: {
          src: '/segmentos/dedetizacao/1.webp',
          alt: 'A pest control technician applying thermal fogging with a fogging machine',
        },
      },
      {
        icon: RefreshCw,
        title: 'Contracts and periodic re-treatment scheduling',
        body: 'Pest control depends on re-treatment at the right frequency. Set up the contract with the cadence (monthly, bimonthly, quarterly) and Dominex generates the re-treatment work orders automatically at the agreed interval, with the scheduling already done. The customer stays protected and you do not lose the renewal by forgetting.',
        image: {
          src: '/segmentos/dedetizacao/2.webp',
          alt: 'An applicator in protective gear spraying product during a re-treatment',
        },
      },
      {
        icon: Smartphone,
        title: 'Everything on the applicator phone, right on site',
        body: 'Pest control happens in warehouses, basements and storerooms, and the applicator handles everything from the phone right there. The Dominex app installs right on the device (PWA): they open the work order, record the products and the dose, take job photos, fill the checklist and capture the customer signature on site. The certificate is ready on the spot, no redoing it at the office.',
        image: {
          src: '/segmentos/dedetizacao/3.webp',
          alt: 'A uniformed applicator performing pest control inside a warehouse',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Digital work orders',
        desc: 'Pest control, rodent control and re-treatment in seconds, with checklist, photos and signature in the app.',
      },
      {
        icon: Droplets,
        title: 'Record of products applied',
        desc: 'Product, dose, method and target pest logged per visit, with the history tied to the customer.',
      },
      {
        icon: FileSignature,
        title: 'Service certificate',
        desc: 'Branded PDF with products, valid-through date and responsible technician, ready as the visit ends.',
      },
      {
        icon: RefreshCw,
        title: 'Recurring re-treatment contracts',
        desc: 'The re-treatment work orders are generated at the right interval, per contract.',
      },
      {
        icon: Calendar,
        title: 'Periodic scheduling',
        desc: 'Schedule the re-treatments, assign the applicators and never miss the contract window.',
      },
      {
        icon: MapPin,
        title: 'Field tracking',
        desc: 'See on the map where each applicator is and get check-ins validated by the customer address.',
      },
      {
        icon: Boxes,
        title: 'Product inventory',
        desc: 'Track the chemicals and bait used on each work order, with automatic stock deduction.',
      },
      {
        icon: BarChart3,
        title: 'Operations dashboard',
        desc: 'Work orders by status, re-treatments per contract and customer ratings in one live dashboard.',
      },
    ],
    testimonials: [
      {
        quote:
          'The certificate used to be done by hand, afterward, and it held everything up. Now it comes out branded the moment the applicator finishes. The customer gets it on the same visit.',
        name: 'Gustavo M.',
        role: 'Owner',
        company: 'urban pest control',
      },
      {
        quote:
          'Every customer has the history of the product and dose applied. When I go back, I know exactly what I used last time.',
        name: 'Letícia A.',
        role: 'Responsible Technician',
        company: 'pest and rodent control',
      },
      {
        quote:
          'The re-treatment contracts generate the work orders on their own. I stopped losing renewals by forgetting the frequency.',
        name: 'Roberto C.',
        role: 'Partner',
        company: 'commercial pest control',
      },
    ],
    faq: [
      {
        q: 'Is Dominex a good fit for pest control companies?',
        a: 'Yes. It was built for pest and rodent control companies. You register each customer, record the products applied on every visit, issue the service certificate and keep the recurring re-treatment contracts in one place.',
      },
      {
        q: 'Does the system generate the service certificate?',
        a: 'Yes. As the visit ends, the service certificate comes out as a branded PDF, with the products applied, the valid-through date and the responsible technician. You hand it to the customer on the spot and have the document ready to present to a health inspector.',
      },
      {
        q: 'Can I record the products and the dose applied?',
        a: 'Yes. Every visit records the products applied, the dose, the method (spraying, bait station, gel) and the target pest. The history is tied to the customer, and the applicator sees what was used before reaching the location.',
      },
      {
        q: 'How do periodic re-treatment contracts work?',
        a: 'You set up the contract with the cadence you want (monthly, bimonthly, quarterly and so on) and Dominex generates the re-treatment work orders automatically at the right interval, with the scheduling already done. The customer stays protected and you do not lose the renewal by forgetting.',
      },
      {
        q: 'Does the applicator work from a phone? Is there an app to install?',
        a: 'Yes, it is all on the phone. Dominex is an app that installs right on the applicator device (PWA), no app store download. On site they open the work order, record the products and the dose, take job photos, fill the checklist and capture the customer signature straight from the phone. The certificate is ready on the spot.',
      },
      {
        q: 'Can I prove the application in an inspection?',
        a: 'Yes. The applicator closes the work order with job photos, a completed checklist and the customer signature, and the certificate records the products and the responsible technician. You prove every application and keep the company compliant.',
      },
      {
        q: 'Can I track the chemical inventory?',
        a: 'Yes. You track the chemicals and bait used on each work order, with automatic stock deduction. That way you know what was applied for each customer and what you have available.',
      },
      {
        q: 'How do I get started? Do I need a credit card?',
        a: 'Just create your account and use it free for 14 days, no credit card. You set up your company in minutes, register your customers and start opening work orders. Cancel anytime, and your data is preserved if you decide to subscribe.',
      },
    ],
    finalCta: {
      title: 'Put your pest control operation in control',
      subtitle:
        'Free for 14 days, no credit card, no hassle. Register your customers, issue the certificate automatically and automate your re-treatment contracts.',
    },
  },
};

export default en;
