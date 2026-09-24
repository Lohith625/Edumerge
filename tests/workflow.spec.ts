import { test, expect } from "@playwright/test";

async function fillAttendanceIntake(page: import("@playwright/test").Page) {
  await page.getByLabel("Roll number").fill("23CS104");
  await page.getByLabel("Class / section").fill("CSE 3B");
  await page
    .locator('input[name="intake_subject_name"]')
    .fill("Discrete Mathematics");
  await page.getByLabel("Affected date").fill("2026-09-22");
  await page.getByLabel("Period / session").fill("Period 2");
  await page
    .getByLabel("Correction needed")
    .fill("Mark present instead of absent");
}

test("student submits, staff claims, student sees ownership", async ({
  browser,
}) => {
  const errors: string[] = [];
  const studentContext = await browser.newContext();
  const staffContext = await browser.newContext();
  const student = await studentContext.newPage();
  const staff = await staffContext.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  staff.on("pageerror", (e) => errors.push(e.message));
  await student.goto("/");
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "My requests." }),
  ).toBeVisible();
  await student
    .getByRole("button", { name: "New request", exact: true })
    .last()
    .click();
  const subject = "Attendance review " + Date.now();
  await student.locator('input[name="subject"]').fill(subject);
  await student
    .getByLabel("Additional details")
    .fill(
      "I attended the Monday mathematics class. Please review my attendance.",
    );
  await student.getByRole("button", { name: "Suggest category" }).click();
  await expect(
    student.getByText("Suggested: Attendance correction"),
  ).toBeVisible();
  await fillAttendanceIntake(student);
  await student
    .getByRole("button", { name: "Submit complete request" })
    .click();
  await expect(student.getByRole("heading", { name: subject })).toBeVisible();
  await staff.goto("/");
  await staff.getByRole("button", { name: "staff", exact: true }).click();
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff.getByRole("button", { name: subject, exact: true }).click();
  await staff.getByRole("button", { name: "Claim ticket" }).click();
  await expect(
    staff.getByText("You now own this request.", { exact: false }),
  ).toBeVisible();
  await student.getByRole("button", { name: "Back to my requests" }).click();
  await student.getByRole("button", { name: "Refresh", exact: true }).click();
  await student.getByRole("button", { name: subject, exact: true }).click();
  await expect(
    student.locator("dd").filter({ hasText: "Priya Rao" }),
  ).toBeVisible();
  await expect(
    student.getByText("Took ownership of this request", { exact: true }),
  ).toBeVisible();
  await staff
    .getByLabel("Write a reply")
    .fill("Attendance register checked internally.");
  await staff.getByLabel("Internal note", { exact: true }).check();
  await staff.getByRole("button", { name: "Add note" }).click();
  await expect(staff.getByText("Internal note added.")).toBeVisible();
  await staff
    .getByLabel("Write a reply")
    .fill("Please confirm the faculty member's name.");
  await staff.getByRole("button", { name: "Request information" }).click();
  await expect(staff.getByText("Information requested.")).toBeVisible();
  await student.getByRole("button", { name: "Back to my requests" }).click();
  await student.getByRole("button", { name: "Refresh", exact: true }).click();
  await student.getByRole("button", { name: subject, exact: true }).click();
  await expect(
    student.getByText("Waiting for student", { exact: true }),
  ).toBeVisible();
  await expect(
    student.getByText("Attendance register checked internally."),
  ).toHaveCount(0);
  await student
    .getByLabel("Write a reply")
    .fill("The faculty member was Dr Rao.");
  await student.getByRole("button", { name: "Send reply" }).click();
  await staff.getByRole("button", { name: "Back to queue" }).click();
  await staff.getByRole("button", { name: "Refresh", exact: true }).click();
  await staff.getByRole("button", { name: subject, exact: true }).click();
  await staff
    .getByLabel("Write a reply")
    .fill("Attendance has been corrected in the register.");
  await staff.getByRole("button", { name: "Resolve" }).click();
  await student.getByRole("button", { name: "Back to my requests" }).click();
  await student.getByRole("button", { name: "Refresh", exact: true }).click();
  await student.getByRole("button", { name: subject, exact: true }).click();
  await expect(student.getByText("Resolved", { exact: true })).toBeVisible();
  await student
    .getByLabel("Why do you need more help?")
    .fill("The portal still shows the old value.");
  await student.getByRole("button", { name: "Reopen request" }).click();
  await expect(student.getByText("Cycle 2", { exact: false })).toBeVisible();
  await student.screenshot({
    path: "test-results/student-detail.png",
    fullPage: true,
  });
  await staff.getByRole("button", { name: "Back to queue" }).click();
  await staff.screenshot({
    path: "test-results/staff-queue.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await studentContext.close();
  await staffContext.close();
});

test("mobile student can view requests and create form", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My requests." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-requests.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "New request", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Subject", { exact: true })).toBeVisible();
  await page.getByLabel("What can we help with?").selectOption("4");
  await expect(page.getByLabel("Certificate type")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await context.close();
});

test("new student signs up, opens profile, staff claims from queue and views student", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  const email = `student${Date.now()}@example.edu`;
  await page.getByLabel("Full name").fill("Test Student");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("TestPassword123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Account created");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New request", exact: true })
    .last()
    .click();
  await page.getByLabel("What can we help with?").selectOption("1");
  await fillAttendanceIntake(page);
  const subject = "Queue claim test " + Date.now();
  await page.locator('input[name="subject"]').fill(subject);
  await page
    .getByLabel("Additional details")
    .fill("Please check the attendance recorded for my morning lecture.");
  await page.getByRole("button", { name: "Submit complete request" }).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  const context = await browser.newContext();
  const staff = await context.newPage();
  await staff.goto("/");
  await staff.getByRole("button", { name: "staff", exact: true }).click();
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  const row = staff.getByRole("row").filter({ hasText: subject });
  await row.getByRole("button", { name: "Claim ticket", exact: true }).click();
  await expect(row).toContainText("Priya Rao");
  await row.getByRole("button", { name: subject, exact: true }).click();
  await expect(staff.getByText("23CS104", { exact: true })).toBeVisible();
  await expect(
    staff.getByText("Mark present instead of absent", { exact: true }),
  ).toBeVisible();
  await staff.getByRole("button", { name: "Back to queue" }).click();
  const refreshedRow = staff.getByRole("row").filter({ hasText: subject });
  await refreshedRow
    .getByRole("button", { name: /Test Student.*Profile/ })
    .click();
  await expect(
    staff.getByRole("heading", { name: "Student profile" }),
  ).toBeVisible();
  await expect(staff.getByText(email, { exact: true })).toBeVisible();
  await staff.getByRole("button", { name: "Back to workspace" }).click();
  await staff.getByRole("button", { name: "My tickets", exact: true }).click();
  await expect(
    staff.getByRole("button", { name: subject, exact: true }),
  ).toBeVisible();
  await staff
    .getByRole("button", { name: "Back to department queue", exact: true })
    .click();
  await staff.screenshot({
    path: "test-results/updated-staff.png",
    fullPage: true,
  });
  await page.getByTitle("Sign out", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await context.close();
});

test("manager sees SLA overview, workload, and notifications", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "manager", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Campus overview." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Department ageing view" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Staff workload" }),
  ).toBeVisible();
  await expect(
    page.getByText("Open escalations", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(
    page.getByRole("heading", { name: "Notifications." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/manager-dashboard.png",
    fullPage: true,
  });
});
