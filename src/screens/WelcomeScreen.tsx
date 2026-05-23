/* WelcomeScreen — Launcher / home screen
   Hero section with app name, tagline, meta badges,
   and navigation preview cards for each major section. */

import { A } from "@solidjs/router";

export function WelcomeScreen() {
  return (
    <div class="launcher">
      <div class="launcher__main">
        {/* Hero section */}
        <section class="launcher__hero">
          <div class="launcher__hero-text">
            <h1>Bridge</h1>
            <p>
              Mission Control for your scripting fleet. Monitor, command, and
              coordinate autonomous vessels from a single console.
            </p>
            <div class="meta">
              <span class="on">Tauri v2</span>
              <span class="on">SolidJS</span>
              <span class="on">Pi-first</span>
            </div>
          </div>
          <div class="launcher__sketch" />
        </section>

        {/* Navigation preview cards */}
        <section class="screens">
          <A href="/fleet" class="screen-card">
            <div class="screen-card__head">
              <span>01</span>
              <b>Fleet</b>
            </div>
            <h3>Fleet Dashboard</h3>
            <p>Monitor all vessels, their status, and active missions.</p>
            <div class="screen-card__preview">
              <div class="wf wf--dashboard">
                <div class="pa" />
                <div class="pb" />
                <div class="pc" />
                <div class="pd" />
              </div>
            </div>
          </A>

          <A href="/charts" class="screen-card">
            <div class="screen-card__head">
              <span>02</span>
              <b>Charts</b>
            </div>
            <h3>Fleet Charts</h3>
            <p>Analytics, performance metrics, and fleet-wide trends.</p>
            <div class="screen-card__preview">
              <div class="wf wf--helm">
                <div class="nav"><span /><span /><span /><span /></div>
                <div class="body"><span /><span /><span /></div>
              </div>
            </div>
          </A>

          <A href="/log" class="screen-card">
            <div class="screen-card__head">
              <span>03</span>
              <b>Log</b>
            </div>
            <h3>Captain&apos;s Log</h3>
            <p>Chronological event feed across all vessels.</p>
            <div class="screen-card__preview">
              <div class="wf wf--log">
                <div class="filters"><span /><span /><span /></div>
                <div class="timeline"><span /><span /><span /><span /><span /></div>
              </div>
            </div>
          </A>

          <A href="/helm" class="screen-card">
            <div class="screen-card__head">
              <span>04</span>
              <b>Helm</b>
            </div>
            <h3>Helm Panel</h3>
            <p>Vessel command interface with execution controls.</p>
            <div class="screen-card__preview">
              <div class="wf wf--dashboard">
                <div class="pa" />
                <div class="pb" />
                <div class="pc" />
                <div class="pd" />
              </div>
            </div>
          </A>
        </section>
      </div>
    </div>
  );
}
