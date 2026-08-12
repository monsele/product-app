import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

export const numericalWorkedExampleFixture = Object.freeze({
  ...createDefaultScene("worked-example"),
  title: "Finding density",
  visual: {
    problem:
      "A rock has a mass of 24 g and a volume of 8 cm³. What is its density?",
    steps: [
      "Use density = mass ÷ volume.",
      "Substitute the known values: 24 g ÷ 8 cm³.",
      "Calculate 24 ÷ 8 = 3.",
    ],
    answer: "Density = 3 g/cm³",
  },
} satisfies Extract<SceneSpec, { template: "worked-example" }>);

export const nonNumericalWorkedExampleFixture = Object.freeze({
  ...createDefaultScene("worked-example"),
  title: "Classifying a change",
  visual: {
    problem: "Is melting ice a physical or chemical change?",
    steps: [
      "Check whether a new substance is formed.",
      "Melting changes ice from solid water to liquid water.",
      "The substance remains water, so the change is physical.",
    ],
    answer: "Melting ice is a physical change.",
  },
} satisfies Extract<SceneSpec, { template: "worked-example" }>);

export const maximumWorkedExampleFixture = Object.freeze({
  ...numericalWorkedExampleFixture,
  title: "Speed",
  visual: {
    problem: "120 m in 6 s: find the speed.",
    steps: [
      "speed = distance ÷ time",
      "distance = 120 m",
      "time = 6 s",
      "substitute values",
      "speed = 120 ÷ 6",
      "divide 120 by 6",
      "the quotient is 20",
      "check the units",
      "distance uses metres",
      "time uses seconds",
      "speed uses m/s",
      "state the result",
    ],
    answer: "20 m/s",
  },
} satisfies Extract<SceneSpec, { template: "worked-example" }>);
