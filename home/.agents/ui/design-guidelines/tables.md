# Tables

## Design guidelines

- Never use uppercase text in table headings — use normal sentence case instead
- Never let table headings wrap — use `whitespace-nowrap` on `<th>` elements
- Never put tables in containers or cards — place them directly on the background
- Only use horizontal lines to divide rows — no vertical lines, no outer borders
- Always use `w-full` so tables fill their container
- Hide table headings with `sr-only` when the column content is self-explanatory — typically tables with 2–3 columns where headings add no value
- Always make tables responsive if all columns won't fit on smaller screens — use a two-div wrapper around the table:
  - Outer div: `overflow-x-auto whitespace-nowrap` with negative horizontal and vertical margins — horizontal margins cancel the page container's padding (e.g. `-mx-4 sm:-mx-6 lg:-mx-8`), vertical margin is always `-my-2`
  - Inner div: `inline-block min-w-full align-middle` with horizontal padding that matches the container's padding (e.g. `px-4 sm:px-6 lg:px-8`) and `py-2`
  - Always match the negative horizontal margins and horizontal padding to the actual container padding used in the page layout
  - Example implementation:
  ```html
  <!-- Example assumes container padding of px-4 sm:px-6 lg:px-8 -->
  <div class="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
    <div class="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
      <table>
        …
      </table>
    </div>
  </div>
  ```
