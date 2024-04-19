<?php
if(isset($_POST['submit'])){
    $to = "temrevil@gmail.com"; // البريد الإلكتروني الذي تريد إرسال الرسالة إليه
    $subject = "Message from Website"; // عنوان الرسالة
    
    // جمع معلومات النموذج
    $name = $_POST['Name'];
    $email = $_POST['Email'];
    $num = $_POST['Num'];
    $message = $_POST['Message'];
    
    // بناء نص الرسالة
    $body = "Name: " . $name . "\n";
    $body .= "Email: " . $email . "\n";
    $body .= "Phone Number: " . $num . "\n";
    $body .= "Message: " . $message;
    
    // إرسال البريد الإلكتروني
    mail($to, $subject, $body);
    
    // إعادة توجيه المستخدم إلى صفحة شكر
    header("Location: thank_you.html");
    exit();
}
?>
