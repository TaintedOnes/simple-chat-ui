import { UserService } from '../service/user.service';
import { Component, OnInit, AfterViewChecked, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HubConnection, HubConnectionBuilder } from '@aspnet/signalr';
import { environment } from 'src/environments/environment';
import { MessageService } from '../service/message.service';
import { ConversationService } from '../service/conversation.service';
import { Guid } from 'guid-typescript';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewChecked {
  @ViewChild('messageContainer') messageContainer: ElementRef;
  loggedInUser = JSON.parse(localStorage.getItem("login-user"))
  users: any;
  chatUser: any;
  messages: any[] = [];
  displayMessages: any[] = []
  message: string
  hubConnection: HubConnection;
  conversation: any;

  connectedUsers: any[] = []
  constructor(private router: Router, private service: UserService, private messageService: MessageService, private conversationService: ConversationService) { }

  ngOnInit() {
    this.messageService.getUserReceivedMessages(this.loggedInUser.id).subscribe((item: any) => {
      if (item) {
        this.messages = item;
        this.messages.forEach(x => {
          x.type = x.sender === this.loggedInUser.id ? 'sent' : 'recieved';
        })
        console.log(this.messages);
      }
      this.checkUnread();
    })

    this.service.getAll().subscribe(
      (user: any) => {
        if (user) {
          this.users = user.filter(x => x.email !== this.loggedInUser.email);
          this.users.forEach(item => {
            item['isActive'] = false;
          })
          this.makeItOnline();
        }
      },
      err => {
        console.log(err);
      },
    );


    this.message = ''
    this.hubConnection = new HubConnectionBuilder().withUrl(environment.chatHubUrl).build();
    const self = this
    this.hubConnection.start()
      .then(() => {
        self.hubConnection.invoke("PublishUserOnConnect", this.loggedInUser.id, this.loggedInUser.firstName, this.loggedInUser.userName)
          .then(() => console.log('User Sent Successfully'))
          .catch(err => console.error(err));

        this.hubConnection.on("BroadcastUserOnConnect", Usrs => {
          this.connectedUsers = Usrs;
          this.makeItOnline();
        })
        this.hubConnection.on("BroadcastUserOnDisconnect", Usrs => {
          this.connectedUsers = Usrs;
          this.users.forEach(item => {
            item.isOnline = false;
          });
          this.makeItOnline();
        })
        this.hubConnection.on("NewMessage", chatId => {
          if (this.chatUser?.chatId === chatId) {
            this.markMessageAsRead(chatId);
          }
          else {
            const conversation = this.conversation.find(c => c.chatId === chatId);
            if (conversation) {
              conversation.isUnread = true;
              this.checkUnread();
            }
          }
        })
      })
      .catch(err => console.log(err));

    this.hubConnection.on('BroadCastDeleteMessage', (connectionId, message) => {
      let deletedMessage = this.messages.find(x => x.id === message.id);
      if (deletedMessage) {
        deletedMessage.isReceiverDeleted = message.isReceiverDeleted;
        deletedMessage.isSenderDeleted = message.isSenderDeleted;
        if (deletedMessage.isReceiverDeleted && deletedMessage.receiver === this.chatUser.id) {
          this.displayMessages = this.messages.filter(x => (x.type === 'sent' && x.receiver === this.chatUser.id) || (x.type === 'recieved' && x.sender === this.chatUser.id));
        }
      }
    })

    this.hubConnection.on('ReceiveDM', (connectionId, message) => {
      message.type = 'recieved';

      if (message.chatId != this.chatUser?.chatId) {
        this.messages.push(message);
        return;
      }
      this.displayMessages.push(message);
    })
  }

  checkUnread() {
    this.conversationService.getAll().subscribe((items: any[]) => {
      if (items) {
        this.conversation = items.sort((a, b) => {
          return new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime();
        });
      }
      this.markUnread();
    })
  }

  markUnread() {
    const markedChatIds = [];
    this.messages.forEach(item => {
      item['isActive'] = false;
      if (item['isNew'] === true && !markedChatIds.includes(item['chatId'])) {
        const conversation = this.conversation.find(c => c.chatId === item['chatId']);
        if (conversation) {
          conversation.isUnread = true;
          markedChatIds.push(conversation.chatId);
        }
      }
    })
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }

  SendDirectMessage() {
    if (this.message != '' && this.message.trim() != '') {
      let guid = Guid.create();
      var msg = {
        chatid: this.chatUser.chatId,
        sender: this.loggedInUser.id,
        receiver: this.loggedInUser.id,
        messageDate: new Date(),
        type: 'sent',
        content: this.message
      };
      this.displayMessages.push(msg);
      this.messages.push(msg);
      this.hubConnection.send('SendMessageToUser', msg)
        .then(() => console.log('Message to user Sent Successfully'))
        .catch(err => console.error(err));
      this.message = '';
    }
  }

  markMessageAsRead(chatId) {
    this.hubConnection.send('MarkAllUnreadMessage', chatId)
      .then(() => console.log('MarkAllUnreadMessage Sent Successfully'))
      .catch(err => console.error(err));
  }

  openChat(user) {
    if (user.isUnread === true) {
      this.markMessageAsRead(user.chatId);
      user.isUnread = false;
    }
    this.users.forEach(item => {
      item['isActive'] = false;
    });
    user['isActive'] = true;
    this.chatUser = user;
    this.displayMessages = this.messages.filter(x => (x.chatId === this.chatUser.chatId) || (x.chatid === this.chatUser.chatId));
  }

  makeItOnline() {
    if (this.connectedUsers && this.users) {
      this.connectedUsers.forEach(item => {
        var u = this.users.find(x => x.userName == item.username);
        if (u) {
          u.isOnline = true;
        }
      })
    }
  }

  deleteMessage(message, deleteType, isSender) {
    let deleteMessage = {
      'deleteType': deleteType,
      'message': message,
      'deletedUserId': this.loggedInUser.id
    }
    this.hubConnection.invoke('DeleteMessage', deleteMessage)
      .then(() => console.log('publish delete request'))
      .catch(err => console.error(err));
    message.isSenderDeleted = isSender;
    message.isReceiverDeleted = !isSender;
  }

  onLogout() {
    this.hubConnection.invoke("RemoveOnlineUser", this.loggedInUser.id)
      .then(() => {
        this.messages.push('User Disconnected Successfully')
      })
      .catch(err => console.error(err));
    localStorage.removeItem('token');
    this.router.navigate(['/user/login']);
  }

  formatDate(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour12: true
    });
    return formatter.format(new Date(date));
  }
}
