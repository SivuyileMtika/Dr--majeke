import React, { useState, useRef, useEffect } from "react";
import { X, Send, Stethoscope } from "lucide-react";
import OpenAI from "openai";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface ChatBotProps {
  isOpen: boolean;
  onClose: () => void;
}

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY, // load from .env
  dangerouslyAllowBrowser: true, // ❗ only for dev testing
});

export const ChatBot: React.FC<ChatBotProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hello! 👋 I'm Themba, your healthcare assistant. How can I help you today?, Molo Ndingu Themba ndingakungeda ngantoon namhlanje.?",
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsTyping(true);

    try {
      // Call ChatGPT API
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are MediBot, a helpful and friendly healthcare assistant for Dr. Majeke's practice. Be clear, short, and supportive." },
          { role: "user", content: messageText },
        ],
      });

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: res.choices[0].message.content || "Sorry, I didn’t understand that.",
        sender: "bot",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          text: "⚠️ Sorry, I'm having trouble connecting right now.",
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    isOpen && (
      <div className="fixed bottom-4 right-4 w-96 bg-white rounded-2xl shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b">
          <h2 className="font-bold flex items-center gap-2">
            <Stethoscope className="w-5 h-5" /> MediBot
          </h2>
          <button onClick={onClose} title="Close chat">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`mb-3 flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`p-2 rounded-lg max-w-xs ${
                  msg.sender === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <p className="text-sm text-gray-500">MediBot is typing...</p>
          )}
          <div ref={messagesEndRef}></div>
        </div>

        {/* Input */}
        <div className="p-3 border-t flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 border rounded px-2 py-1"
          />
          <button
            onClick={() => handleSendMessage()}
            className="bg-blue-500 text-white px-4 rounded"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  );
};