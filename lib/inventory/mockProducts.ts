import type { InventoryProduct } from "@/types/inventory";

export const mockProducts: InventoryProduct[] = [
  {
    id: "1",
    name: "Miller Lite Bottle",
    aliases: ["miller lite", "miller light", "miller", "miller lite bottle"],
    squareCount: 97,
  },
  {
    id: "2",
    name: "Bud Light Bottle",
    aliases: ["bud light", "bud", "bud light bottle"],
    squareCount: 74,
  },
  {
    id: "3",
    name: "Coors Light Bottle",
    aliases: ["coors light", "coors", "coors light bottle"],
    squareCount: 61,
  },
  {
    id: "4",
    name: "Pabst Blue Ribbon Can",
    aliases: ["pabst", "pabst blue ribbon", "pabst blue ribbon can"],
    squareCount: 35,
  },
];
