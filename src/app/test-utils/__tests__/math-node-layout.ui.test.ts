/**
 * Math node layout (node chrome, wave 2 corrections).
 *
 * Two user-visible contracts:
 *  - the single `return` output port sits at the node's top-right, the same
 *    place every Onshape node puts its outputs, and stays visible when the
 *    node is collapsed;
 *  - the node title uses the normal 14px/700 sans title scale, not the
 *    monospace literal style and not a smaller size.
 *
 * jsdom does not lay out or cascade SFC styles, so the pixel geometry is
 * asserted by the browser probe (qa:math-field); here the structural DOM
 * contract and the stylesheet contract are pinned, matching the existing
 * nodechrome-style tests.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";

import MathExpressionNodeView from "../../customization/MathExpressionNodeView.vue";
import { makeMathNode } from "../fixtures";

const stubs = {
  Ref: { template: '<div class="socket-stub" />', props: ["data", "emit"] },
};

const viewSrc = readFileSync("src/app/customization/MathExpressionNodeView.vue", "utf8");
const commonSrc = readFileSync("src/app/common.css", "utf8");

function mountView(source = "2 * PI * r") {
  const node = makeMathNode(source);
  const wrapper = mount(MathExpressionNodeView, {
    props: { data: node, emit: () => {}, width: 260, height: 160 },
    global: { stubs },
    attachTo: document.body,
  });
  return { wrapper, node };
}

/** The stylesheet rule for a class, as source text (jsdom cannot cascade). */
function ruleFor(selector: string): string {
  const index = viewSrc.indexOf(`${selector} {`);
  expect(index).toBeGreaterThan(-1);
  return viewSrc.slice(index, viewSrc.indexOf("}", index) + 1);
}

async function collapse(wrapper: VueWrapper): Promise<void> {
  await wrapper.get(".math-toggle").trigger("click");
  await wrapper.vm.$forceUpdate();
  await wrapper.vm.$nextTick();
}

describe("MathExpressionNodeView output socket geometry", () => {
  it("renders the return port in a top-right row above the field, outside the collapsible body", () => {
    const { wrapper } = mountView();
    const row = wrapper.get('[data-testid="math-output-row"]');
    const socket = wrapper.get('[data-testid="math-return-socket"]');

    // Right-aligned, and the only return socket in the card (no duplicate
    // lower socket row any more).
    expect(row.classes()).toContain("math-output-row");
    expect(wrapper.findAll('[data-testid="math-return-socket"]').length).toBe(1);
    expect(wrapper.findAll(".math-sockets [data-testid=\"math-return-socket\"]").length).toBe(0);

    // The label reads "return" and sits beside the port.
    expect(row.get(".math-output-label").text()).toBe("return");

    // DOM order: header, output row, then the body (field + input rows), so
    // the port is the topmost thing inside the card body.
    const html = wrapper.html();
    const header = html.indexOf("math-header");
    const outputRow = html.indexOf("math-output-row");
    const body = html.indexOf("math-body");
    const field = html.indexOf("math-field");
    expect(header).toBeGreaterThan(-1);
    expect(outputRow).toBeGreaterThan(header);
    expect(body).toBeGreaterThan(outputRow);
    expect(field).toBeGreaterThan(body);

    // The port payload still names side/key so connections resolve it.
    expect(socket.attributes("data-testid")).toBe("math-return-socket");
    wrapper.unmount();
  });

  it("keeps the return port visible when collapsed, and the title typeset", async () => {
    const { wrapper, node } = mountView("2 * PI * r");
    await collapse(wrapper);

    expect(node.collapsed).toBe(true);
    expect(wrapper.find('[data-testid="math-field"]').exists()).toBe(false);
    const row = wrapper.find('[data-testid="math-output-row"]');
    expect(row.exists()).toBe(true);
    expect(row.find('[data-testid="math-return-socket"]').exists()).toBe(true);
    expect(wrapper.get(".math-title").text()).toContain("\\pi");
    wrapper.unmount();
  });

  it("input socket rows stay inside the body, below the field", () => {
    const { wrapper } = mountView("length * width");
    const html = wrapper.html();
    expect(html.indexOf("math-field")).toBeLessThan(html.indexOf("math-socket-row"));
    const inputSockets = wrapper.findAll('[data-testid^="math-input-socket-"]');
    expect(inputSockets.length).toBe(2);
    expect(inputSockets[0].attributes("data-testid")).toBe("math-input-socket-length");
    wrapper.unmount();
  });

  it("stylesheet pins the top-right row and the half-socket edge offset", () => {
    const row = ruleFor(".math-output-row");
    expect(row).toMatch(/justify-content:\s*flex-end/);
    expect(row).toMatch(/align-items:\s*center/);
    const socket = ruleFor(".math-output-socket");
    expect(socket).toMatch(/margin-right:\s*-1px/);
  });
});

describe("MathExpressionNodeView title typography", () => {
  const title = ruleFor(".math-title");

  it("uses the normal node title scale: sans 14px/700", () => {
    expect(title).toMatch(/font-family:\s*var\(--font-sans/);
    expect(title).toMatch(/font-size:\s*var\(--font-size-title,\s*14px\)/);
    expect(title).toMatch(/font-weight:\s*var\(--font-weight-title,\s*700\)/);
    expect(title).not.toMatch(/--font-mono/);
    expect(title).not.toMatch(/--font-size-label/);
  });

  it("the tokens it consumes are the 14px/700 title tokens", () => {
    expect(commonSrc).toMatch(/--font-size-title:\s*14px/);
    expect(commonSrc).toMatch(/--font-weight-title:\s*700/);
    expect(commonSrc).toMatch(/--font-sans:\s*'Inter', 'Segoe UI', system-ui/);
  });

  it("the rendered title carries the title class, expanded and collapsed", async () => {
    const { wrapper } = mountView("2 * PI * r");
    expect(wrapper.get('[data-testid="math-title"]').classes()).toContain("math-title");
    await collapse(wrapper);
    expect(wrapper.get('[data-testid="math-title"]').classes()).toContain("math-title");
    wrapper.unmount();
  });
});

describe("MathExpressionNodeView socket wiring contract", () => {
  it("locks node translation on both ports so a wire drag cannot drag the card", () => {
    // Without TranslateLock the card follows the pointer, keeping its own
    // output under the cursor, so the drop always hits the source socket and
    // no connection is made (qa:math-field drives the real pointer path).
    expect(viewSrc).toMatch(/@pointerdown="lockTranslate"/);
    expect(viewSrc.match(/@pointerdown="lockTranslate"/g) ?? []).toHaveLength(2);
    expect(viewSrc).toMatch(/import \{ TranslateLock \} from "\.\.\/utils\/translatelock"/);
  });

  it("remounts the return port on type changes, not on every render seed", () => {
    // The plugin mounts the socket component into the Ref element and does
    // not push prop updates into it; keying by type updates the label/colour,
    // while keying by `seed` churns the listener on every render.
    expect(viewSrc).toMatch(/:key="'return-' \+ returnTypeKey\(\)"/);
    expect(viewSrc).not.toMatch(/:key="'return-' \+ seed"/);
  });

  it("exposes the node id for stable harness lookups", () => {
    expect(viewSrc).toMatch(/:data-node-id="data\.id"/);
  });
});
