import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from "@react-email/components";
import * as React from "react";

interface SEOAlertEmailProps {
  projectName: string;
  url: string;
  changes: Array<{
    field: string;
    oldValue: string;
    newValue: string;
  }>;
  viewDetailsUrl: string;
}

export const SEOAlertEmail = ({
  projectName,
  url,
  changes,
  viewDetailsUrl,
}: SEOAlertEmailProps) => (
  <Html>
    <Head />
    <Preview>SEO Change Detected for {projectName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>SEO Change Detected</Heading>
        <Text style={text}>
          Our monitor detected changes on <strong>{projectName}</strong> for the following URL:
          <br />
          <Link href={url} style={link}>{url}</Link>
        </Text>

        <Section style={tableSection}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Field</th>
                <th style={th}>Previous</th>
                <th style={th}>Current</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change, index) => (
                <tr key={index}>
                  <td style={tdLabel}>{change.field}</td>
                  <td style={tdOld}>{change.oldValue || "(Empty)"}</td>
                  <td style={tdNew}>{change.newValue || "(Empty)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section style={btnContainer}>
          <Button style={button} href={viewDetailsUrl}>
            Review Changes in Dashboard
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          Sent by your SEO Monitoring Engine. You are receiving this because you enabled alerts for this project.
        </Text>
      </Container>
    </Body>
  </Html>
);

// Styles
const main = { backgroundColor: "#f6f9fc", fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif' };
const container = { margin: "0 auto", padding: "20px 0 48px", width: "580px" };
const h1 = { color: "#333", fontSize: "24px", fontWeight: "bold", margin: "40px 0" };
const text = { color: "#333", fontSize: "16px", lineHeight: "26px" };
const link = { color: "#275af5", textDecoration: "none" };
const tableSection = { margin: "24px 0" };
const table = { width: "100%", borderCollapse: "collapse" as const };
const th = { textAlign: "left" as const, padding: "12px", borderBottom: "1px solid #eee", color: "#666", fontSize: "12px", textTransform: "uppercase" as const };
const tdLabel = { padding: "12px", fontWeight: "bold", borderBottom: "1px solid #eee" };
const tdOld = { padding: "12px", color: "#d93025", textDecoration: "line-through", borderBottom: "1px solid #eee", backgroundColor: "#fff5f5" };
const tdNew = { padding: "12px", color: "#188038", fontWeight: "bold", borderBottom: "1px solid #eee", backgroundColor: "#f6ffed" };
const button = { backgroundColor: "#000", borderRadius: "5px", color: "#fff", fontSize: "16px", fontWeight: "bold", textDecoration: "none", textAlign: "center" as const, display: "block", width: "100%", padding: "12px" };
const btnContainer = { textAlign: "center" as const, margin: "32px 0" };
const hr = { borderColor: "#cccccc", margin: "20px 0" };
const footer = { color: "#8898aa", fontSize: "12px" };

export default SEOAlertEmail;

