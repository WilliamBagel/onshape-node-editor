/**
 * Math expression field (Blender-style single representation).
 *
 * The field shows the typeset formula when idle and the editable source when
 * clicked. These tests pin the two user-visible defects: the source must be
 * visible while editing (highlight layer is populated, not an empty <pre>),
 * and there must be no second `.math-preview` block below the field.
 */
import { describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";

import MathExpressionNodeView from "../../customization/MathExpressionNodeView.vue";
import { makeMathNode } from "../fixtures";

const stubs = {
  Ref: { template: '<div class="socket-stub" />', props: ["data", "emit"] },
};

function mountView(source = "sqrt(x^2 + y^2) / PI") {
  const node = makeMathNode(source);
  const wrapper = mount(MathExpressionNodeView, {
    props: { data: node, emit: () => {}, width: 260, height: 160 },
    global: { stubs },
    attachTo: document.body,
  });
  return { wrapper, node };
}

async function openEditor(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-testid="math-field-rendered"]').trigger("click");
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
}

describe("MathExpressionNodeView field", () => {
  it("shows the typeset formula in the field itself and no separate preview", () => {
    const { wrapper } = mountView();
    const field = wrapper.get('[data-testid="math-field"]');

    expect(field.find(".katex").exists()).toBe(true);
    expect(field.find(".mfrac").exists()).toBe(true);
    expect(field.find(".sqrt").exists()).toBe(true);
    expect(wrapper.find(".math-preview").exists()).toBe(false);
    expect(wrapper.find('[data-testid="math-field-source"]').exists()).toBe(false);

    // The idle field is a focusable control labelled with the source.
    const idle = wrapper.get('[data-testid="math-field-rendered"]');
    expect(idle.element.tagName).toBe("BUTTON");
    expect(idle.attributes("aria-label")).toContain("sqrt(x^2 + y^2) / PI");
    expect(wrapper.find('[data-testid="math-edit-cue"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("clicking the field shows the visible, syntax-highlighted source", async () => {
    const { wrapper, node } = mountView("length * width + 2");
    await openEditor(wrapper);

    const textarea = wrapper.get('[data-testid="math-field-source"]');
    expect((textarea.element as HTMLTextAreaElement).value).toBe("length * width + 2");
    expect(textarea.attributes("aria-label")).toContain("Math expression source");

    // The highlight layer behind the transparent textarea carries the text —
    // this is the invisible-source regression: it used to stay empty.
    const pre = wrapper.get('[data-testid="math-field-highlight"]');
    expect(pre.text().trim()).toBe("length * width + 2");
    expect(pre.findAll(".tok-ident").length).toBeGreaterThan(1);
    expect(pre.findAll(".tok-op").length).toBeGreaterThan(0);
    expect(pre.findAll(".tok-number").length).toBe(1);
    expect(pre.html()).toContain('class="tok-ident"');

    // One representation: the rendered formula is gone while editing.
    expect(wrapper.find('[data-testid="math-field"] .katex').exists()).toBe(false);
    expect(node.source).toBe("length * width + 2");
    wrapper.unmount();
  });

  it("Enter commits the draft and re-typesets the same field", async () => {
    const { wrapper, node } = mountView("a + b");
    await openEditor(wrapper);

    await wrapper.get('[data-testid="math-field-source"]').setValue("2 * PI * r");
    await wrapper.get('[data-testid="math-field-source"]').trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();

    expect(node.source).toBe("2 * PI * r");
    expect(wrapper.find('[data-testid="math-field-source"]').exists()).toBe(false);
    const field = wrapper.get('[data-testid="math-field"]');
    expect(field.find(".katex").exists()).toBe(true);
    expect(field.find(".math-fallback").exists()).toBe(false);
    expect(wrapper.get('[data-testid="math-field-rendered"]').attributes("aria-label")).toContain(
      "2 * PI * r",
    );
    expect(wrapper.find('[data-testid="math-error"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("blur commits without a separate preview appearing", async () => {
    const { wrapper, node } = mountView("a + b");
    await openEditor(wrapper);
    await wrapper.get('[data-testid="math-field-source"]').setValue("a * b");
    await wrapper.get('[data-testid="math-field-source"]').trigger("blur");
    await wrapper.vm.$nextTick();

    expect(node.source).toBe("a * b");
    expect(wrapper.get('[data-testid="math-field"]').find(".katex").exists()).toBe(true);
    expect(wrapper.find(".math-preview").exists()).toBe(false);
    wrapper.unmount();
  });

  it("invalid expression keeps its source, marks the field and shows the error", async () => {
    const { wrapper, node } = mountView("a + b");
    await openEditor(wrapper);
    await wrapper.get('[data-testid="math-field-source"]').setValue("a + * b");
    await wrapper.get('[data-testid="math-field-source"]').trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();

    expect(node.isValid).toBe(false);
    expect(node.source).toBe("a + * b");
    const field = wrapper.get('[data-testid="math-field"]');
    expect(field.classes()).toContain("invalid");
    expect(field.find(".katex").exists()).toBe(false);
    expect(field.get(".math-fallback").text()).toBe("a + * b");
    const error = wrapper.get('[data-testid="math-error"]');
    expect(error.attributes("role")).toBe("alert");
    expect(error.text().length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("Escape discards the draft, restores the previous source and re-typesets", async () => {
    const { wrapper, node } = mountView("2 * PI * r");
    await openEditor(wrapper);
    await wrapper.get('[data-testid="math-field-source"]').setValue("2 * * broken");
    await wrapper.get('[data-testid="math-field-source"]').trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();

    expect(node.source).toBe("2 * PI * r");
    expect(node.isValid).toBe(true);
    expect(wrapper.find('[data-testid="math-field-source"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="math-field"]').find(".katex").exists()).toBe(true);
    expect(wrapper.find('[data-testid="math-error"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("external source changes are pulled into the idle field", async () => {
    const { wrapper, node } = mountView("a + b");
    node.setSource("2 * PI * r");
    wrapper.vm.$forceUpdate();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="math-field-rendered"]').attributes("aria-label")).toContain(
      "2 * PI * r",
    );
    expect(wrapper.get('[data-testid="math-field"]').find(".katex").exists()).toBe(true);
    wrapper.unmount();
  });

  it("empty source shows a placeholder in the same field", () => {
    const { wrapper } = mountView("");
    const field = wrapper.get('[data-testid="math-field"]');
    expect(field.get(".math-placeholder").text()).toBe("Enter an expression");
    expect(field.find(".katex").exists()).toBe(false);
    wrapper.unmount();
  });

  it("collapsed node keeps the typeset title and hides the field", async () => {
    const { wrapper, node } = mountView("2 * PI * r");
    node.setCollapsed(true);
    node.update();
    await wrapper.vm.$forceUpdate();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="math-field"]').exists()).toBe(false);
    expect(wrapper.get(".math-title").text()).toContain("\\pi");
    expect(wrapper.get(".math-title").text()).not.toBe("Math expression");
    wrapper.unmount();
  });
});
