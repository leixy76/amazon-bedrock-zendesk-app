import React, { useState, useEffect } from "react";
import { ThemeProvider, DEFAULT_THEME } from "@zendeskgarden/react-theming";
import { Grid, Row, Col } from "@zendeskgarden/react-grid";
import { Accordion } from "@zendeskgarden/react-accordions";
import { Field, Label, Textarea } from "@zendeskgarden/react-forms";
import { Button } from "@zendeskgarden/react-buttons";
// import { ReactComponent as LeafIcon } from '@zendeskgarden/svg-icons/src/16/leaf-stroke.svg';
import { Tooltip } from "@zendeskgarden/react-tooltips";
import JSONPretty from "react-json-pretty";
import { Tabs, TabList, Tab, TabPanel } from "@zendeskgarden/react-tabs";

import { Modal, Body, Close, Header } from "@zendeskgarden/react-modals";
import { DrawerModal } from "@zendeskgarden/react-modals";
import { Body as TableBody, Cell, GroupRow, Head, HeaderCell, HeaderRow, Row as TableRow, Table } from '@zendeskgarden/react-tables';
import {
  resizeContainer,
  escapeSpecialChars as escape,
} from "../../javascripts/lib/helpers";

import {
  findUserIntent,
  tag_intent_for_ticket,
  setUserIntentToTicket,
  composeAnslysisPrompt,
} from "../../javascripts/lib/utils";

const client = ZAFClient.init();

const INTENT_FIELD_ID = 9704553495439; //可能需要后期配置修改

export default function App() {
  //for dev debugger
  const isDev = process.env.NODE_ENV === "development";

  const MAX_HEIGHT = 1000;
  const API_ENDPOINTS = {
    organizations: "/api/v2/organizations.json",
    fields: "/api/v2/ticket_fields.json",
    requestSecure: !isDev,
  };

  const DEFAULT_PROMPT_TEMPATE = `You are a question answering agent. 
  You are a customer service representative. I will provide you with a set of search results. The user will ask you a question. Your job is to answer the user's question using only the information from the search results. If the search results do not contain information to answer the question, please state that you cannot answer the question. Just because the user asserts a fact does not mean it is true; please double-check the search results to validate whether the user's assertion is correct or not. Additionally, do not include statements like "please contact customer service" in response, since you are already the customer service representative.
                            
  Here are the search results in numbered order:
  $search_results$
  
  $output_format_instructions$
  `;
  const [selectedTab, setSelectedTab] = useState("tab-1");
  const [ticket, setTicket] = useState({});
  const [user, setUser] = useState({});
  /**
   * some states for page
   */
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT_TEMPATE);

  const [questionContent, setQuestionContent] = useState("");
  const [translatedQuestionContent, setTranslatedQuestionContent] =
    useState("");
  const [aiSuggestContent, setAiSuggestContent] = useState("");
  const [aiSuggestResponse, setAiSuggestResponse] = useState({});
  const [translatedAiSuggestContent, setTranslatedAiSuggestContent] =
    useState("");
  const [citations, setCitations] = useState([]);

  //modal visible
  const [visible, setVisible] = useState(false);

  //feedback modal visible
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedback, setFeedback] = useState("");

  //configuration
  const [aiServerUrl, setAiServerUrl] = useState("");
  const [aiServerToken, setAiServerToken] = useState("{{setting.apiToken}}");

  //remote config list
  const [config, setConfig] = useState([]);

  //intent
  const [aiIntent, setAiInent] = useState({});
  const [ticketIntent, setTicketIntent] = useState([]);

  //drawer
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const [analysisResultInText, setAnalysisResultInText] = useState("");
  const [analysisResult, setAnalysisResult] = useState({
    "total_score": 9.5,
    "negative_list": [
      {
        "category": "sample",
        "subcategory": "sample",
        "detail": "smple",
        "deduction_score": -0.5,
        "item_reason": "sample",
        "refer": "xxx"
      }
    ],
    "positive_list": [
      {
        "category": "sample",
        "subcategory": "sample",
        "detail": "smple",
        "deduction_score": 1,
        "item_reason": "sample",
        "refer": "xxx"
      }
    ],
    "feedback": "测试例子"
  });
  const [analysisPrompt, setAnalysisPrompt] = useState("");

  //get config value
  const get_config_item = (key) => {
    const prompt_rag_obj = config.find((obj) => obj.item_key === key);
    return prompt_rag_obj?.item_value;
  };

  const default_search_filter = {
    // "equals": {
    //   "key": "language",
    //   "value": "japanese"
    // }
  };
  const composeSearchFilter = () => {
    return default_search_filter;
  };

  const logToRemote = (action, feedback) => {
    const inputData = {
      action: action,
      user: user.name,
      input_data: {
        ticket_id: ticket.id,
        ticket_brand: ticket.brand.name,
        ticket_channel: "support",
        question: questionContent,
        kb_reference: citations,
        prompt_template: aiSuggestResponse.result.prompt,
        cost: aiSuggestResponse.result.cost_time,
        feedback: feedback,
      },
    };
    const options = {
      url: aiServerUrl + "/api/log",
      type: "POST",
      headers: { Authorization: "Basic " + aiServerToken },
      secure: API_ENDPOINTS.requestSecure, // very important
      contentType: "application/json",
      data: JSON.stringify(inputData),
    };
    client.request(options).then((response) => {
      console.log("log successfully");
    });
  };

  const callTranslate = (prompt, content, callback) => {
    const inputData = {
      input: prompt + " --> " + content,
    };
    const options = {
      url: aiServerUrl + "/api/bedrock/chat",
      type: "POST",
      headers: { Authorization: "Basic " + aiServerToken },
      secure: API_ENDPOINTS.requestSecure, // very important
      contentType: "application/json",
      data: JSON.stringify(inputData),
    };
    setVisible(true);
    client.request(options).then((response) => {
      setVisible(false);
      callback(response.result.content[0]["text"]);
    });
  };

  /**
   * 调用chat接口
   * @param {*} prompt
   * @param {*} callback
   */
  const callChat = async (prompt) => {
    const inputData = {
      input: prompt,
    };
    const options = {
      url: aiServerUrl + "/api/bedrock/chat",
      type: "POST",
      headers: { Authorization: "Basic " + aiServerToken },
      secure: API_ENDPOINTS.requestSecure, // very important
      contentType: "application/json",
      data: JSON.stringify(inputData),
    };
    // setVisible(true);
    return await client.request(options);
  };

  //获取aws fetch api
  const fetchRemoteApi = (api, callback, responseCallback) => {
    const options = {
      url: aiServerUrl + api,
      type: "POST",
      headers: { Authorization: "Basic " + aiServerToken },
      secure: API_ENDPOINTS.requestSecure, // very important
      contentType: "application/json",
      data: JSON.stringify(inputData),
    };
    callback(options);
    client.request(options).then((response) => {
      responseCallback(response);
    });
  };

  //
  const callAISuggest = async () => {
    const field_options = {
      url: "/api/v2/tickets/" + ticket.id + ".json",
      type: "GET",
      contentType: "application/json",
    };
    let ticket_fiels_resonse = await client.request(field_options);

    let field_value = ticket_fiels_resonse.ticket.custom_fields.find(
      (obj) => obj.id == INTENT_FIELD_ID
    );

    let ticket_intent = "";
    if (field_value && field_value.value && field_value.value.length > 0) {
      setTicketIntent(field_value?.value || []);
      ticket_intent = field_value.value[0];
    }

    const inputData = {
      input: questionContent,
      ticketIntent: ticket_intent, //传第一个值
      ticketBrand: "" + ticket.brand.id || "",
      filter: composeSearchFilter(),
    };
    debugger;
    setTranslatedAiSuggestContent("");
    const options = {
      url: aiServerUrl + "/api/bedrock/rag_with_rewrite",
      type: "POST",
      headers: { Authorization: "Basic " + aiServerToken },
      secure: API_ENDPOINTS.requestSecure, // very important
      contentType: "application/json",
      data: JSON.stringify(inputData),
    };
    setVisible(true);
    let response = await client.request(options);
    setVisible(false);
    setAiSuggestResponse(response);
    setAiSuggestContent(response.result.rewrite_value);
    setCitations(response.result.response.citations);
  };
  const pormptChange = (e) => {
    setPrompt(e.target.value);
  };

  const feedbackChange = (e) => {
    setFeedback(e.target.value);
  };

  const translateContentToCN = () => {
    callTranslate(
      "please translate below content to Chinese(简体中文)",
      questionContent,
      (res) => {
        setTranslatedQuestionContent(res);
      }
    );
  };

  const translateContentToEN = () => {
    callTranslate(
      "please translate below content to English",
      questionContent,
      (res) => {
        setTranslatedQuestionContent(res);
      }
    );
  };

  const translateSuggestToEN = () => {
    callTranslate(
      "please translate below content to English",
      aiSuggestContent,
      (res) => {
        setTranslatedAiSuggestContent(res);
      }
    );
  };

  const translateSuggestToCN = () => {
    callTranslate(
      "please translate below content to Chinese(简体中文)",
      aiSuggestContent,
      (res) => {
        setTranslatedAiSuggestContent(res);
      }
    );
  };

  const checkAiSuggestContent = () => {
    // debugger
    if (!aiSuggestContent) {
      alert("没有填充");
      return false;
    }
    return true;
  };

  const adoptionSuggestion = () => {
    if (checkAiSuggestContent()) {
      client
        .invoke("ticket.comment.appendText", aiSuggestContent)
        .then(function () {
          console.log("text has been appended");
        });
      logToRemote("1");
    }
  };

  const needImproveAction = () => {
    if (checkAiSuggestContent()) {
      logToRemote("2", {
        feedback: feedback,
      });
    }
    setFeedback("");
    setFeedbackVisible(false);
  };

  const needMinorImproveAction = () => {
    if (checkAiSuggestContent()) {
      logToRemote("3");
    }
  };

  /**
   * handle intent retrieve
   */
  const handleIntentRetrieve = async () => {
    setVisible(true);
    //tag it
    let field_response = await client.request(API_ENDPOINTS.fields);
    let userIntentList = JSON.stringify(findUserIntent(field_response));
    // debugger
    let intent = await tag_intent_for_ticket(
      client,
      ticket.id,
      userIntentList,
      questionContent,
      {
        url: aiServerUrl,
        token: aiServerToken,
        secure: API_ENDPOINTS.requestSecure,
      }
    );
    // debugger
    setAiInent(intent);
    setVisible(false);
  };

  const adoptionIntent = async () => {
    setVisible(true);
    debugger;
    setUserIntentToTicket(client, ticket, INTENT_FIELD_ID, [
      aiIntent.intent.value,
    ]);
    setTicketIntent([aiIntent.intent.value]);
    setVisible(false);
  };

  // 通过AI来检查ticket内客服回复的质量
  const customerServiceQualityAnalytics = async () => {
    // ticket content always be initialized to ticket state
    setVisible(true);
    let prompt = composeAnslysisPrompt(ticket);
    setAnalysisPrompt(prompt)
    let response = await callChat(prompt);
    let result_string = response.result.content[0].text;
    setAnalysisResultInText(result_string);
    setAnalysisResult(JSON.parse(result_string))
    setVisible(false);
  };

  /**
   * initialize data
   */
  useEffect(() => {
    const fetchConfig = async () => {
      const response = await axios.get("/api/config");
      setConfig(response.data);
      setPrompt(get_config_item("prompt_rag"));
    };

    const fetchData = async () => {
      const metadata = await client.metadata();
      // debugger;
      setAiServerUrl(metadata.settings.aiServerUrl);

      const confPrompt = metadata.settings.prompt;
      if (confPrompt) {
        setPrompt(metadata.settings.prompt);
      }
      if (isDev) {
        setAiServerToken(metadata.settings.apiToken);
      }

      const ticketResponse = await client.get("ticket");
      setTicket(ticketResponse["ticket"]);
      // composeAnslysisPrompt(ticketResponse["ticket"])
      // debugger

      const response = await client.get("currentUser");
      setUser(response["currentUser"]);

      const ticketInfo = await client.get([
        "ticket.description",
        "ticket.subject",
        "ticket.id",
      ]);

      const ticketContent =
        "subject " +
        ticketInfo["ticket.subject"] +
        "\r\ncontent " +
        ticketInfo["ticket.description"];
      setQuestionContent(ticketContent);
      // debugger
      const options = {
        url: "/api/v2/tickets/" + ticketInfo["ticket.id"] + ".json",
        type: "GET",
        contentType: "application/json",
      };
      let ticket_fiels_resonse = await client.request(options);
      let field_value = ticket_fiels_resonse.ticket.custom_fields.find(
        (obj) => obj.id == INTENT_FIELD_ID
      );
      setTicketIntent(field_value || []);
      // debugger
    };

    fetchData();
  }, []);

  return (
    <ThemeProvider theme={{ ...DEFAULT_THEME }}>
      <Grid>

        <Row>
          <Col>
            <Label>AI By Amazon Bedrock(Claude 3)</Label>
          </Col>
        </Row>
        <Tabs selectedItem={selectedTab} onChange={setSelectedTab}>
          <TabList>
            <Tab item="tab-1">AI建议</Tab>
            <Tab item="tab-2">AI质检</Tab>
            <Tab item="tab-3">Next</Tab>
          </TabList>
          <TabPanel item="tab-1">
            <Grid>
              <Row>
                <Col>
                  <Label>意图识别</Label>
                </Col>
                <Col>
                  <Button
                    size="small"
                    isDanger
                    onClick={handleIntentRetrieve}
                    style={{ marginLeft: 10 }}
                  >
                    识别意图
                  </Button>
                  <Button
                    size="small"
                    isDanger
                    onClick={adoptionIntent}
                    style={{ marginLeft: 10 }}
                    disabled={!aiIntent.intent}
                  >
                    采纳意图
                  </Button>
                </Col>
                <Col>
                  <Label>{aiIntent?.reason}</Label>
                  <Label>{aiIntent?.intent?.value}</Label>
                </Col>
              </Row>
              <Row>
                {visible && (
                  <Modal onClose={() => setVisible(false)}>
                    {/* <Header tag="h2">AI Working</Header> */}
                    <Body>
                      <Row>
                        <Col textAlign="center">
                          {/* <Dots size={128} color={PALETTE.green[600]} /> */}
                          <img class="loader" src="spinner.gif" />
                        </Col>
                      </Row>
                    </Body>
                    <Close aria-label="Close modal" />
                  </Modal>
                )}
              </Row>
              <Row>
                {feedbackVisible && (
                  <Modal onClose={() => setFeedbackVisible(false)}>
                    <Header tag="h2">Feedback</Header>
                    <Body>
                      <Row>
                        <Col textAlign="center">
                          <Textarea
                            isResizable
                            rows="4"
                            value={feedback}
                            onChange={feedbackChange}
                          ></Textarea>
                        </Col>
                      </Row>
                      <Row>
                        <Button
                          size="small"
                          isPrimary
                          isDanger
                          onClick={needImproveAction}
                          style={{ marginRight: 10 }}
                        >
                          Submit Feedback
                        </Button>
                      </Row>
                    </Body>
                    <Close aria-label="Close modal" />
                  </Modal>
                )}
              </Row>
              <Row>
                <DrawerModal isOpen={isOpen} onClose={close}>
                  <DrawerModal.Header tag="h2">Show RAG Prompt</DrawerModal.Header>
                  <DrawerModal.Body>
                    <Textarea
                      isResizable
                      rows="12"
                      value={prompt}
                      onChange={pormptChange}
                    ></Textarea>
                  </DrawerModal.Body>
                  <DrawerModal.Footer>
                    <DrawerModal.FooterItem>
                      <Button isPrimary onClick={close}>
                        Close
                      </Button>
                    </DrawerModal.FooterItem>
                  </DrawerModal.Footer>
                  <DrawerModal.Close />
                </DrawerModal>
              </Row>
              <Row>
                <Col sm={8}>
                  <Field>
                    <Label>Ticket Content</Label>
                    <Textarea
                      isResizable
                      value={questionContent}
                      rows="6"
                      onChange={(e) => setQuestionContent(e.target.value)}
                    ></Textarea>
                  </Field>
                  <Field style={{ marginTop: 10 }}>
                    <Tooltip content="Primary leaf">
                      <Button
                        size="small"
                        isPrimary
                        onClick={callAISuggest}
                        style={{ marginRight: 10 }}
                      >
                        AI Suggest
                      </Button>
                    </Tooltip>
                    <Tooltip content="Primary leaf">
                      <Button
                        size="small"
                        onClick={translateContentToCN}
                        style={{ marginRight: 10 }}
                      >
                        翻译为中文
                      </Button>
                    </Tooltip>
                    <Tooltip content="Primary leaf">
                      <Button
                        size="small"
                        onClick={translateContentToEN}
                        style={{ marginRight: 10 }}
                      >
                        To English
                      </Button>
                    </Tooltip>
                  </Field>
                </Col>
                <Col>
                  <Field>
                    <Label>Tranlsated</Label>
                    <Textarea
                      isResizable
                      readonly
                      rows="6"
                      value={translatedQuestionContent}
                    />
                  </Field>
                </Col>
              </Row>
              <Row>
                <Col sm={8}>
                  <Field>
                    <Label>AI Suggest</Label>
                    <Textarea
                      isResizable
                      rows="6"
                      value={aiSuggestContent}
                      onChange={(e) => setAiSuggestContent(e.target.value)}
                    />
                  </Field>
                  <Field style={{ marginTop: 10 }}>
                    <Tooltip content="Primary leaf">
                      <Button
                        size="small"
                        isPrimary
                        // isDanger
                        disabled={aiSuggestContent == undefined}
                        onClick={adoptionSuggestion}
                        style={{ marginRight: 10 }}
                      >
                        Use it
                      </Button>
                    </Tooltip>
                    <Tooltip content="Feedback">
                      <Button
                        size="small"
                        isPrimary
                        isDanger
                        onClick={() => {
                          setFeedbackVisible(true);
                        }}
                        style={{ marginRight: 10 }}
                      >
                        Need Improve
                      </Button>
                    </Tooltip>
                    <Tooltip content="Feedback">
                      <Button
                        size="small"
                        isPrimary
                        isDanger
                        onClick={needMinorImproveAction}
                        style={{ marginRight: 10 }}
                      >
                        Use it with minor changes
                      </Button>
                    </Tooltip>
                    <Tooltip content="Primary leaf">
                      <Button
                        size="small"
                        onClick={translateSuggestToCN}
                        style={{ marginRight: 10 }}
                      >
                        翻译为中文
                      </Button>
                    </Tooltip>
                    <Tooltip content="Primary leaf">
                      <Button
                        size="small"
                        onClick={translateSuggestToEN}
                        style={{ marginRight: 10 }}
                      >
                        To English
                      </Button>
                    </Tooltip>
                  </Field>
                </Col>
                <Col>
                  <Field>
                    <Label>Tranlsated</Label>
                    <Textarea
                      isResizable
                      rows="6"
                      readonly
                      value={translatedAiSuggestContent}
                    />
                  </Field>
                </Col>
              </Row>
              <Row>
                <Col>
                  <Label>Source details</Label>
                  <Accordion level={4}>
                    {citations.map((citation, index) => (
                      <Accordion.Section key={index}>
                        <Accordion.Header>
                          <Accordion.Label>
                            {citation.generatedResponsePart.textResponsePart.text}
                          </Accordion.Label>
                        </Accordion.Header>
                        <Accordion.Panel>
                          <Label>References</Label>
                          <JSONPretty
                            data={JSON.stringify(
                              citation.retrievedReferences,
                              null,
                              2
                            )}
                          // theme={JSONPrettyMon}
                          ></JSONPretty>
                        </Accordion.Panel>
                      </Accordion.Section>
                    ))}
                  </Accordion>
                </Col>
              </Row>
            </Grid>
          </TabPanel>
          <TabPanel item="tab-2">
            <Grid>
              <Row>
                <Col>
                  <Col textAlign="center">
                    <Textarea
                      isResizable
                      rows="4"
                      value={analysisPrompt}
                    ></Textarea>
                  </Col>
                  <Button
                    size="small"
                    isDanger
                    onClick={customerServiceQualityAnalytics}
                    style={{ marginLeft: 10 }}
                  >
                    开始质检
                  </Button>
                </Col>
              </Row>
              <Row>
                <Col>
                  <div style={{ overflowX: 'auto' }}>
                    <Table style={{ minWidth: 500 }}>
                      <Head>
                        <HeaderRow>
                          <HeaderCell>Category</HeaderCell>
                          <HeaderCell>Sub Category</HeaderCell>
                          <HeaderCell>detail</HeaderCell>
                          <HeaderCell>deduction_score</HeaderCell>
                          <HeaderCell>item_reason</HeaderCell>
                          <HeaderCell>refer</HeaderCell>
                        </HeaderRow>
                      </Head>
                      <TableBody>
                        <GroupRow>
                          <Cell colSpan={1}>
                            <b>total_score</b>
                          </Cell>
                          <Cell colSpan={5}>
                            <b>{analysisResult.total_score}</b>
                          </Cell>
                        </GroupRow>
                        <GroupRow>
                          <Cell colSpan={1}>
                            <b>feedback</b>
                          </Cell>
                          <Cell colSpan={5}>
                            <b>{analysisResult.feedback}</b>
                          </Cell>
                        </GroupRow>
                        <GroupRow>
                          <Cell colSpan={6}>
                            <b>positive_list</b>
                          </Cell>
                        </GroupRow>
                        {analysisResult.positive_list.map((item, index) => (
                          <TableRow key={index}>
                            <Cell>{item.category}</Cell>
                            <Cell>{item.subcategory}</Cell>
                            <Cell>{item.detail}</Cell>
                            <Cell>{item.item_score}</Cell>
                            <Cell>{item.item_reason}</Cell>
                            <Cell>{item.refer}</Cell>
                          </TableRow>
                        ))}
                        <GroupRow>
                          <Cell colSpan={6}>
                            <b>negative_list</b>
                          </Cell>
                        </GroupRow>
                        {analysisResult.negative_list.map((item, index) => (
                          <TableRow key={index}>
                            <Cell>{item.category}</Cell>
                            <Cell>{item.subcategory}</Cell>
                            <Cell>{item.detail}</Cell>
                            <Cell>{item.item_score}</Cell>
                            <Cell>{item.item_reason}</Cell>
                            <Cell>{item.refer}</Cell>
                          </TableRow>
                        ))}


                      </TableBody>
                    </Table>
                  </div>
                </Col>
                {/* <Col>
                  <pre>{analysisResultInText}</pre>
                </Col> */}
              </Row>
            </Grid>
          </TabPanel>
          <TabPanel item="tab-3">
            Coming Soon...
          </TabPanel>
        </Tabs>

      </Grid>
    </ThemeProvider>
  );
  // return resizeContainer(this._client, MAX_HEIGHT)
}
