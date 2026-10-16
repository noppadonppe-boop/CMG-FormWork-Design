# Owner manual acceptance — emulator / demonstration only

1. Use a separate project folder and run npm ci, npm test and npm run build.
2. Start npm run dev and verify desktop/mobile navigation, project/case changes and persistence.
3. Select F01. Verify volume 30m³, side form area35m², bottom pressure60kPa.
4. Select F02. Verify L outline, six exposed faces, area10m², perimeter14m, volume25m³.
5. Select C01. Verify height8m, pressure192kPa and no footing Tie-body result.
6. Upload a harmless sample PDF, select a page; verify image/text and manual dimension editing.
7. Change geometry and verify confirmation resets; invalid dimensions must show recoverable errors.
8. Confirm geometry, select/change proposal and inspect actual last-bay spacing in the drawing table.
9. Verify a large demand is FAIL and a passing numerical screen remains INCOMPLETE.
10. Open report; verify formulas, substitutions and all missing checks are present.
11. Print to PDF and inspect each page for clipped formulas/tables, font readability and correct drawings.
12. If emulator prerequisites are installed, start npm run emulators and enable .env emulator mode.
13. Create a demo Auth account, save project, reload from DB and save server-recomputed result.
14. Test AI only after server provider configuration and explicit authorization; output remains draft.
15. Do not process real drawings, issue a construction document or deploy production in this checklist.

Record browser/version, operating system, test date, result and screenshots/errors as evidence.

## v0.2 cloud checks (not yet performed in a browser)

- Open the private Site with the owning account; select F01 and inspect Design Criteria/layout.
- Default grids: actual vertical500mm, F1 studs300mm/supports600mm. Governing row pmax60kPa gives T18kN, corner9kN, F1 sumP=sumR90kN.
- Set pairShare0.5: member M/V/deflection halve; whole-pair tie and corner forces stay unchanged.
- Ae0 and SWL0 show unknown capacities; setting Ae50mm² causes rupture screen14kN <18kN.
- Inspect graph and PDF report; verify readable formulas, no clipping, levels and reaction tables.
- C01 and F02 have only corner-supported face models and no fabricated through-tie design.
- Import old v1 backup: original dimensions retained, new parameters added, confirmation reset.
- All favorable numerical screens still INCOMPLETE; no construction release.

## v0.3 cloud checks (not yet performed in a browser)

- Select C01; Design Criteria shows Column yoke settings and initially unknown Cx/Cy/interaction.
- Default DEMAND_ONLY displays corner normal demands but no implied ring axial forces.
- Select PINNED_RING only as an explicit draft assumption; inspect per-side N and N+M interaction,
  interface-force directions, and zero residual Fx/Fy. Stability must remain blocked.
- Use square1000x1000x1000mm, gamma20, stud250, waler500: 5kN per corner axis, resultant7.071kN.
- Set Cx=Cy=8kN and LINEAR: component demands fit, combined interaction1.25 FAIL.
- Verify all new inputs, source draft text, force graphic and checks appear in the PDF draft.
- Import a v2 backup; preserve dimensions/pairShare while adding unknown corner criteria and resetting confirmation.
