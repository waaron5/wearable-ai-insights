# AI Insights from Wearable Data — Panivo

Panivo is an AI-powered health insights platform that transforms raw wearable data into clear, actionable recommendations.

Instead of forcing users to interpret fragmented metrics from multiple sources, the system aggregates, standardizes, and explains health data in plain English.

---

## Overview

Wearable platforms (Apple Health, Whoop, Oura, etc.) provide large amounts of data, but very little clarity.

Panivo solves this by:
- Aggregating raw health data into a unified format  
- Applying AI to interpret trends and patterns  
- Delivering concise, high-value insights users can act on  

The goal is simple: **tell users what matters, why it matters, and what to do next**.

---

## Key Features

- Unified health data model across wearable sources  
- AI-generated health summaries and recommendations  
- Baseline tracking and trend analysis over time  
- Deterministic fallback mode for consistent local testing  
- Designed for fast, minimal UX (1–2 screens for core insights)  

---

## Architecture

**Mobile App (`/mobile`)**
- Expo + React Native (iOS-focused)
- Interfaces with Apple HealthKit and backend API

**Backend (`/backend`)**
- FastAPI (Python)
- PostgreSQL database
- Data standardization + AI insight generation layer

---

## Product Development Process

This project was built around a clear gap in the market:

**1. Problem Identification**
- Wearable apps expose data, but don’t provide meaningful interpretation  
- Users are left guessing what actually impacts their health  

**2. System Design**
- Created a standardized data layer to normalize inputs across devices  
- Designed AI pipelines to convert raw metrics into structured insights  

**3. Iteration & Refinement**
- Built end-to-end pipeline (data → backend → AI → UI)  
- Continuously refined insight quality and UX simplicity  
- Focused on reducing cognitive load, not adding more dashboards  

**4. Outcome**
- Functional mobile app delivering real-time health insights  
- Demonstrates a scalable foundation for personalized health intelligence  

---

## Local Development

### Backend

```bash
docker compose up -d db backend
