import { describe, it, expect } from "vitest";
import { sanitizeInlineLatex } from "../latexSanitizer";

describe("sanitizeInlineLatex", () => {
  describe("arrow replacements", () => {
    it("should replace $\\rightarrow$ with →", () => {
      expect(sanitizeInlineLatex("planning $\\rightarrow$ coding")).toBe(
        "planning → coding",
      );
    });

    it("should replace $\\leftarrow$ with ←", () => {
      expect(sanitizeInlineLatex("$\\leftarrow$")).toBe("←");
    });

    it("should replace $\\Rightarrow$ with ⇒", () => {
      expect(sanitizeInlineLatex("A $\\Rightarrow$ B")).toBe("A ⇒ B");
    });

    it("should replace $\\to$ with →", () => {
      expect(sanitizeInlineLatex("input $\\to$ output")).toBe(
        "input → output",
      );
    });

    it("should replace $\\implies$ with ⟹", () => {
      expect(sanitizeInlineLatex("A $\\implies$ B")).toBe("A ⟹ B");
    });

    it("should replace $\\iff$ with ⟺", () => {
      expect(sanitizeInlineLatex("P $\\iff$ Q")).toBe("P ⟺ Q");
    });

    it("should replace $\\mapsto$ with ↦", () => {
      expect(sanitizeInlineLatex("x $\\mapsto$ f(x)")).toBe("x ↦ f(x)");
    });
  });

  describe("math operator replacements", () => {
    it("should replace $\\times$ with ×", () => {
      expect(sanitizeInlineLatex("3 $\\times$ 4")).toBe("3 × 4");
    });

    it("should replace $\\div$ with ÷", () => {
      expect(sanitizeInlineLatex("12 $\\div$ 3")).toBe("12 ÷ 3");
    });

    it("should replace $\\pm$ with ±", () => {
      expect(sanitizeInlineLatex("5 $\\pm$ 2")).toBe("5 ± 2");
    });

    it("should replace $\\cdot$ with ·", () => {
      expect(sanitizeInlineLatex("a $\\cdot$ b")).toBe("a · b");
    });

    it("should replace $\\infty$ with ∞", () => {
      expect(sanitizeInlineLatex("$\\infty$")).toBe("∞");
    });
  });

  describe("relation replacements", () => {
    it("should replace $\\neq$ with ≠", () => {
      expect(sanitizeInlineLatex("x $\\neq$ y")).toBe("x ≠ y");
    });

    it("should replace $\\leq$ and $\\geq$", () => {
      expect(sanitizeInlineLatex("$\\leq$ and $\\geq$")).toBe("≤ and ≥");
    });

    it("should replace $\\approx$ with ≈", () => {
      expect(sanitizeInlineLatex("$\\approx$")).toBe("≈");
    });
  });

  describe("logic and set theory replacements", () => {
    it("should replace $\\forall$ with ∀", () => {
      expect(sanitizeInlineLatex("$\\forall$ x")).toBe("∀ x");
    });

    it("should replace $\\exists$ with ∃", () => {
      expect(sanitizeInlineLatex("$\\exists$")).toBe("∃");
    });

    it("should replace $\\in$ with ∈", () => {
      expect(sanitizeInlineLatex("x $\\in$ S")).toBe("x ∈ S");
    });

    it("should replace $\\subset$ with ⊂", () => {
      expect(sanitizeInlineLatex("A $\\subset$ B")).toBe("A ⊂ B");
    });

    it("should replace $\\emptyset$ with ∅", () => {
      expect(sanitizeInlineLatex("$\\emptyset$")).toBe("∅");
    });
  });

  describe("greek letter replacements", () => {
    it("should replace common lowercase greek letters", () => {
      expect(sanitizeInlineLatex("$\\alpha$ $\\beta$ $\\gamma$")).toBe(
        "α β γ",
      );
    });

    it("should replace uppercase greek letters", () => {
      expect(sanitizeInlineLatex("$\\Delta$ $\\Sigma$ $\\Omega$")).toBe(
        "Δ Σ Ω",
      );
    });

    it("should replace $\\lambda$ with λ", () => {
      expect(sanitizeInlineLatex("$\\lambda$")).toBe("λ");
    });

    it("should replace $\\pi$ with π", () => {
      expect(sanitizeInlineLatex("$\\pi$")).toBe("π");
    });
  });

  describe("dots replacements", () => {
    it("should replace $\\ldots$ with …", () => {
      expect(sanitizeInlineLatex("1, 2, $\\ldots$, n")).toBe("1, 2, …, n");
    });

    it("should replace $\\cdots$ with ⋯", () => {
      expect(sanitizeInlineLatex("$\\cdots$")).toBe("⋯");
    });
  });

  describe("multiple replacements in one string", () => {
    it("should replace all occurrences", () => {
      const input =
        "planning $\\rightarrow$ coding $\\rightarrow$ testing";
      expect(sanitizeInlineLatex(input)).toBe(
        "planning → coding → testing",
      );
    });

    it("should handle mixed command types", () => {
      const input = "$\\alpha$ $\\rightarrow$ $\\beta$ $\\neq$ $\\gamma$";
      expect(sanitizeInlineLatex(input)).toBe("α → β ≠ γ");
    });
  });

  describe("currency safety — must NOT replace", () => {
    it("should not touch standalone dollar amounts", () => {
      expect(sanitizeInlineLatex("$10")).toBe("$10");
    });

    it("should not touch dollar amounts with commas", () => {
      expect(sanitizeInlineLatex("$10, $30")).toBe("$10, $30");
    });

    it("should not touch dollar ranges", () => {
      expect(sanitizeInlineLatex("$5-$10")).toBe("$5-$10");
    });

    it("should not touch dollar amounts with parenthetical discounts", () => {
      expect(sanitizeInlineLatex("$100 ($50 off)")).toBe("$100 ($50 off)");
    });

    it("should not touch dollar amounts in sentences", () => {
      expect(sanitizeInlineLatex("it costs $25 per month")).toBe(
        "it costs $25 per month",
      );
    });

    it("should not touch lone dollar signs", () => {
      expect(sanitizeInlineLatex("$ and $")).toBe("$ and $");
    });
  });

  describe("code span safety — must NOT replace inside backticks", () => {
    it("should not replace when preceded by backtick", () => {
      expect(sanitizeInlineLatex("`$\\rightarrow$`")).toBe(
        "`$\\rightarrow$`",
      );
    });

    it("should not replace when immediately inside backticks", () => {
      expect(sanitizeInlineLatex("`$\\alpha$`")).toBe("`$\\alpha$`");
    });
  });

  describe("unknown commands — must NOT replace", () => {
    it("should leave unrecognized LaTeX commands as-is", () => {
      expect(sanitizeInlineLatex("$\\notarealcommand$")).toBe(
        "$\\notarealcommand$",
      );
    });
  });

  describe("block math — must NOT interfere", () => {
    it("should not touch $$...$$ block math", () => {
      const blockMath = "$$\\sum_{i=0}^{n} x_i$$";
      expect(sanitizeInlineLatex(blockMath)).toBe(blockMath);
    });
  });

  describe("empty and edge cases", () => {
    it("should handle empty string", () => {
      expect(sanitizeInlineLatex("")).toBe("");
    });

    it("should handle string with no LaTeX", () => {
      const plainText = "just a normal sentence with no math";
      expect(sanitizeInlineLatex(plainText)).toBe(plainText);
    });

    it("should handle content that is just a command", () => {
      expect(sanitizeInlineLatex("$\\rightarrow$")).toBe("→");
    });
  });
});
